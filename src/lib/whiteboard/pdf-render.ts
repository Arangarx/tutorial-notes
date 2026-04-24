"use client";

/**
 * Browser-side PDF -> PNG renderer for the whiteboard "Insert PDF"
 * flow.
 *
 * Uses pdfjs-dist with the worker hosted at `/pdfjs/pdf.worker.min.mjs`
 * (copied from `node_modules/pdfjs-dist/build` by
 * `scripts/copy-pdfjs-worker.mjs` at install time).
 *
 * Render policy (driven by the whiteboard plan's "PDF/image upload"
 * section):
 *
 *   - 30-page hard cap. Wyzant caps at 25; we add a small buffer for
 *     the common "30-question worksheet split into pages" case.
 *   - 25 MB hard cap on the source file. Larger PDFs are typically
 *     scanned textbooks where insertion-on-canvas isn't the right
 *     mental model anyway (the tutor wants to share a link instead).
 *   - Sequential page render (NOT parallel). pdfjs's worker is
 *     single-threaded and parallelism on iOS Safari blows past the
 *     ~250 MB/tab memory ceiling within a few large pages. Sequential
 *     keeps the high-water mark to one page at a time.
 *   - 1.5x render scale. Higher than 1.0 so handwritten text stays
 *     legible after the canvas is zoomed in; lower than 2.0 so iOS
 *     doesn't OOM on a 30-page worksheet.
 *
 * iOS Safari memory caveat: even with sequential rendering a
 * 30-page colour PDF can hit the per-tab memory ceiling on iPhones.
 * The UI layer (`PdfImageUploadButton`) surfaces a copy warning when
 * the user is on iOS so they pick a smaller PDF instead of crashing
 * the tab mid-session.
 *
 * Failure-mode contract: every public function returns a structured
 * result. We never throw into the React tree.
 */

import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";

/**
 * Hard caps. Adjust by editing here, NOT by passing options through —
 * keeping them centralized stops a callsite from accidentally
 * uncapping the limit and OOM-ing iOS Safari mid-session.
 */
export const PDF_MAX_PAGES = 30;
export const PDF_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const PDF_RENDER_SCALE = 1.5;

/**
 * Minimum + maximum dimensions (in pixels) for a single rendered page.
 * Below the minimum we'd lose legibility on Excalidraw at default
 * zoom; above the maximum a single page would dominate the canvas.
 * pdfjs's getViewport gets clamped to land inside this band.
 */
const PDF_MIN_PAGE_PIXELS = 600;
const PDF_MAX_PAGE_PIXELS = 2400;

/** Public-facing result types — discriminated union for easy switch use. */
export type PdfPageRender = {
  pageIndex: number; // 1-based
  pngBlob: Blob;
  widthPx: number;
  heightPx: number;
};

export type PdfRenderProgress = {
  phase: "loading" | "rendering" | "done";
  /** 1-based page currently being rendered (rendering phase only). */
  pageIndex?: number;
  totalPages?: number;
};

export type RenderPdfOptions = {
  /** Optional callback for the toolbar progress bar / status copy. */
  onProgress?: (progress: PdfRenderProgress) => void;
  /**
   * Cancellation hook. Set `aborted = true` from the caller (e.g. when
   * the modal is closed mid-render) and the next page boundary will
   * bail out cleanly. We can't cancel mid-page — pdfjs's RenderTask
   * supports `.cancel()` but the canvas re-render isn't atomic.
   */
  cancellation?: { aborted: boolean };
  /** Override the default render scale; clamped to [0.5, 3.0]. */
  scale?: number;
};

export type RenderPdfResult =
  | {
      ok: true;
      pages: PdfPageRender[];
      totalPagesInPdf: number;
      truncated: boolean;
    }
  | {
      ok: false;
      reason:
        | "too-large"
        | "too-many-pages"
        | "load-failed"
        | "render-failed"
        | "aborted"
        | "no-pdfjs"
        | "browser-only";
      message: string;
    };

let pdfjsModulePromise: Promise<typeof import("pdfjs-dist")> | null = null;

/**
 * Lazily load the pdfjs-dist module + wire its worker URL. The actual
 * module is ~430 KB minified — we don't pull it into the main bundle.
 * Subsequent calls return the cached promise so concurrent uploads
 * share a single fetch.
 */
async function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (typeof window === "undefined") {
    throw new Error("PDF rendering is only available in the browser.");
  }
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const mod = await import("pdfjs-dist");
      // The worker file is copied by scripts/copy-pdfjs-worker.mjs at
      // install time. See public/pdfjs/.gitignore'd folder.
      mod.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return mod;
    })();
  }
  return pdfjsModulePromise;
}

function clampScale(s: number | undefined): number {
  const v = typeof s === "number" && Number.isFinite(s) ? s : PDF_RENDER_SCALE;
  return Math.min(3.0, Math.max(0.5, v));
}

/**
 * Compute a per-page scale factor that keeps the rendered bitmap
 * inside [PDF_MIN_PAGE_PIXELS, PDF_MAX_PAGE_PIXELS] on the longer
 * edge. Returns the *additional* scaling beyond the user-provided
 * base scale.
 */
function clampViewportScale(
  baseScale: number,
  pageNaturalLongEdge: number
): number {
  const renderedLongEdge = pageNaturalLongEdge * baseScale;
  if (renderedLongEdge > PDF_MAX_PAGE_PIXELS) {
    return PDF_MAX_PAGE_PIXELS / renderedLongEdge;
  }
  if (renderedLongEdge < PDF_MIN_PAGE_PIXELS) {
    // Don't blow tiny pages up too aggressively — cap the upscale at 2x.
    return Math.min(2, PDF_MIN_PAGE_PIXELS / renderedLongEdge);
  }
  return 1;
}

async function blobFromCanvas(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("canvas.toBlob returned null"));
      },
      "image/png",
      // Quality has no effect for image/png but Safari has historically
      // ignored undefined arguments — pass 1 for max safety.
      1
    );
  });
}

/**
 * Render a PDF File into one PNG Blob per page. The caller wires the
 * resulting blobs into Excalidraw via `insertPdfPagesOnCanvas`.
 */
export async function renderPdfFileToPngs(
  file: File,
  opts: RenderPdfOptions = {}
): Promise<RenderPdfResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "browser-only", message: "PDF rendering must run in the browser." };
  }
  if (file.size > PDF_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: "too-large",
      message: `PDF is ${mb} MB; the upload limit is ${PDF_MAX_BYTES / (1024 * 1024)} MB.`,
    };
  }

  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await loadPdfJs();
  } catch (err) {
    return {
      ok: false,
      reason: "no-pdfjs",
      message: `Could not load the PDF renderer: ${(err as Error).message}`,
    };
  }

  opts.onProgress?.({ phase: "loading" });

  const arrayBuffer = await file.arrayBuffer();
  let doc: PDFDocumentProxy;
  try {
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    doc = await loadingTask.promise;
  } catch (err) {
    return {
      ok: false,
      reason: "load-failed",
      message: `That doesn't look like a valid PDF (${(err as Error).message}).`,
    };
  }

  const totalPages = doc.numPages;
  const pagesToRender = Math.min(totalPages, PDF_MAX_PAGES);
  const truncated = totalPages > PDF_MAX_PAGES;
  const baseScale = clampScale(opts.scale);

  const pages: PdfPageRender[] = [];

  try {
    for (let i = 1; i <= pagesToRender; i++) {
      if (opts.cancellation?.aborted) {
        return { ok: false, reason: "aborted", message: "Render cancelled." };
      }
      opts.onProgress?.({
        phase: "rendering",
        pageIndex: i,
        totalPages: pagesToRender,
      });
      const page: PDFPageProxy = await doc.getPage(i);
      const naturalViewport = page.getViewport({ scale: 1 });
      const longEdge = Math.max(naturalViewport.width, naturalViewport.height);
      const adjustedScale = baseScale * clampViewportScale(baseScale, longEdge);
      const viewport = page.getViewport({ scale: adjustedScale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return {
          ok: false,
          reason: "render-failed",
          message: "Browser rejected a 2D canvas — out of memory?",
        };
      }
      // pdfjs's render returns a RenderTask we can `.cancel()` on, but
      // we cancel at page boundaries instead so a half-rendered page
      // doesn't leak into the result array.
      const task: RenderTask = page.render({ canvasContext: ctx, viewport, canvas });
      try {
        await task.promise;
      } finally {
        // Free the page resources before moving to the next page —
        // critical for iOS Safari to release the bitmap data.
        page.cleanup();
      }
      const pngBlob = await blobFromCanvas(canvas);
      pages.push({
        pageIndex: i,
        pngBlob,
        widthPx: canvas.width,
        heightPx: canvas.height,
      });
      // Drop the canvas reference so GC can reclaim the bitmap before
      // the next iteration. Without this iOS Safari aggregates memory
      // across iterations and OOMs around page ~12.
      canvas.width = 0;
      canvas.height = 0;
    }
  } catch (err) {
    return {
      ok: false,
      reason: "render-failed",
      message: `PDF rendering failed at page ${pages.length + 1}: ${(err as Error).message}`,
    };
  } finally {
    try {
      await doc.cleanup();
      doc.destroy();
    } catch {
      // Cleanup failures are best-effort.
    }
  }

  opts.onProgress?.({ phase: "done", pageIndex: pagesToRender, totalPages: pagesToRender });

  return { ok: true, pages, totalPagesInPdf: totalPages, truncated };
}

/**
 * Coarse iOS Safari sniff. Used by the upload UI to surface the
 * "iOS memory caveat" copy. Not a security check — purely UX.
 */
export function isLikelyIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPad on iPadOS 13+ reports as "Macintosh" but exposes touch.
  const iPadOS =
    ua.includes("Macintosh") &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  const iPhoneOrIPad = /iPad|iPhone|iPod/.test(ua) || iPadOS;
  if (!iPhoneOrIPad) return false;
  // CriOS (Chrome on iOS) and FxiOS (Firefox on iOS) still use the
  // WebKit engine + the same memory ceiling, so we treat them all
  // as "iOS Safari" for the warning.
  return /Safari|CriOS|FxiOS/.test(ua) || true;
}
