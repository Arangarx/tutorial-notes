"use client";

/**
 * Helpers for inserting raster images and rendered PDF pages into a
 * live Excalidraw scene.
 *
 * Two boundaries to cross:
 *
 *   1. Excalidraw's `BinaryFiles` table — every image element has a
 *      `fileId` that points into a per-scene file blob registry.
 *      `excalidrawAPI.addFiles([...])` is how we write to it.
 *
 *   2. Vercel Blob — we upload each image so that:
 *        a. The recording's events.json carries a stable `assetUrl`
 *           per element (the replay player loads bitmaps from there).
 *        b. The student client (joining mid-session) can load images
 *           via the asset URL even though they don't have the local
 *           dataURL the tutor's browser holds.
 *
 * The dataURL stays in Excalidraw's `BinaryFiles` map for the live
 * canvas; the URL goes into `customData.assetUrl` for replay + sync.
 *
 * Layout policy: PDF pages tile vertically with a fixed gap, anchored
 * just below the current viewport center. Single image inserts land
 * at the viewport center. The Wyzant whiteboard uses the same model
 * (paste-near-cursor) so Sarah's muscle memory carries over.
 */

import { uploadWhiteboardAsset } from "@/lib/whiteboard/upload";
import type { PdfPageRender } from "@/lib/whiteboard/pdf-render";

/**
 * Minimal structural type for the bits of Excalidraw's `ExcalidrawImperativeAPI`
 * we touch. Mirrors the one in `excalidraw-adapter.ts` — we keep our
 * own structural type so a future Excalidraw upgrade can't silently
 * break our callers.
 */
export type ExcalidrawApiLike = {
  getSceneElements: () => ReadonlyArray<unknown>;
  /** Excalidraw `BinaryFiles` map (keyed by file id) — used to back-fill `assetUrl` for native image inserts. */
  getFiles?: () => Readonly<Record<string, unknown>>;
  getAppState: () => {
    scrollX: number;
    scrollY: number;
    width: number;
    height: number;
    zoom: { value: number };
  };
  addFiles: (
    files: Array<{
      id: string;
      mimeType: "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp" | "image/gif";
      dataURL: string;
      created: number;
    }>
  ) => void;
  updateScene: (data: { elements: ReadonlyArray<unknown> }) => void;
  scrollToContent?: (
    target?: ReadonlyArray<unknown>,
    opts?: { fitToContent?: boolean; animate?: boolean }
  ) => void;
};

export type InsertAssetCommonArgs = {
  excalidrawAPI: ExcalidrawApiLike;
  whiteboardSessionId: string;
  studentId: string;
};

export type InsertImageResult =
  | { ok: true; elementId: string; assetUrl: string }
  | { ok: false; reason: string };

export type InsertPdfResult =
  | {
      ok: true;
      elementIds: string[];
      assetUrls: string[];
      pagesInserted: number;
    }
  | { ok: false; reason: string };

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const PDF_PAGE_GAP_PX = 32;
/**
 * Width we render each PDF page at on the Excalidraw canvas. The
 * actual bitmap may be larger; we scale down to keep a 30-page
 * worksheet from spanning multiple zoom levels.
 */
const PDF_PAGE_RENDER_WIDTH = 720;
/**
 * Width for a single image insert. Bigger than the PDF page so a
 * single screenshot reads at glance; still small enough that a small
 * canvas zoom shows the whole image.
 */
const SINGLE_IMAGE_DEFAULT_WIDTH = 540;

function makeRandomElementId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  return `el_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function makeRandomFileId(): string {
  // Excalidraw uses opaque strings for file ids; uuid is fine.
  return makeRandomElementId();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

function viewportCenter(api: ExcalidrawApiLike): { x: number; y: number } {
  const s = api.getAppState();
  const zoom = s.zoom?.value || 1;
  // Excalidraw's scrollX/scrollY are in scene coords AFTER zoom; the
  // viewport center in scene space is computed as scrollX +
  // (width / zoom) / 2. (Reverse-engineered from
  // viewportCoordsToSceneCoords; verified on 0.18.)
  const cx = s.scrollX + s.width / 2 / zoom;
  const cy = s.scrollY + s.height / 2 / zoom;
  return { x: cx, y: cy };
}

const IMAGE_MIME_WHITELIST: ReadonlyArray<string> = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

function normalizeMime(
  mime: string
): "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp" | "image/gif" | null {
  switch (mime) {
    case "image/png":
      return "image/png";
    case "image/jpeg":
    case "image/jpg":
      return "image/jpeg";
    case "image/gif":
      return "image/gif";
    case "image/webp":
      return "image/webp";
    case "image/svg+xml":
      return "image/svg+xml";
    default:
      return null;
  }
}

async function imageDimensionsFromBlob(
  blob: Blob
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new window.Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("Could not decode image."));
        img.src = url;
      }
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Build the structural shape Excalidraw expects for an image element.
 *
 * We DON'T import Excalidraw's element type here because (a) it's a
 * branded readonly type that's awkward to construct, and (b) we want
 * the same code path to work in jsdom tests where Excalidraw isn't
 * loaded. The fields we set match what `convertToExcalidrawElements`
 * would produce; Excalidraw's `restoreElements` fills in defaults for
 * everything we omit.
 */
function buildImageElement(args: {
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  assetUrl: string;
  altText?: string;
}): Record<string, unknown> {
  const now = Date.now();
  return {
    id: makeRandomElementId(),
    type: "image",
    fileId: args.fileId,
    status: "saved",
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    groupIds: [],
    frameId: null,
    roundness: null,
    scale: [1, 1],
    crop: null,
    customData: {
      assetUrl: args.assetUrl,
      altText: args.altText,
    },
  };
}

/**
 * Insert a single raster image (or SVG) onto the canvas.
 *
 * Flow:
 *   1. Validate mime + size.
 *   2. Decode dimensions so the on-canvas placement is proportional.
 *   3. Upload to Vercel Blob (so replay + students can load it).
 *   4. Register the dataURL in Excalidraw's BinaryFiles via addFiles.
 *   5. Insert the element via updateScene at viewport center.
 *
 * Failure modes are returned, never thrown — the toolbar surfaces them.
 */
export async function insertImageOnCanvas(args: InsertAssetCommonArgs & {
  file: File;
  altText?: string;
}): Promise<InsertImageResult> {
  const { excalidrawAPI, whiteboardSessionId, studentId, file, altText } =
    args;

  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `Image is ${mb} MB — the upload limit is ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`,
    };
  }
  const mime = normalizeMime(file.type);
  if (!mime || !IMAGE_MIME_WHITELIST.includes(file.type)) {
    return {
      ok: false,
      reason: `Unsupported image type: ${file.type || "unknown"}. Use PNG, JPG, GIF, WebP, or SVG.`,
    };
  }

  let dims: { width: number; height: number };
  try {
    dims = await imageDimensionsFromBlob(file);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  if (dims.width <= 0 || dims.height <= 0) {
    return { ok: false, reason: "Image has zero dimensions; can't insert." };
  }

  // Upload first so we have a stable URL for the recording event log.
  const upload = await uploadWhiteboardAsset({
    whiteboardSessionId,
    studentId,
    blob: file,
    filename: file.name || "image",
    contentType: mime,
    assetTag: "image",
  });
  if (!upload.ok) return { ok: false, reason: upload.error };

  let dataURL: string;
  try {
    dataURL = await blobToDataUrl(file);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  const fileId = makeRandomFileId();
  excalidrawAPI.addFiles([
    {
      id: fileId,
      mimeType: mime,
      dataURL,
      created: Date.now(),
    },
  ]);

  // Pin width to a sensible default and let height scale to preserve
  // aspect — keeps the inserted image visible without dominating the
  // canvas at default zoom.
  const aspect = dims.height / dims.width;
  const width = Math.min(SINGLE_IMAGE_DEFAULT_WIDTH, dims.width);
  const height = width * aspect;
  const center = viewportCenter(excalidrawAPI);
  const x = center.x - width / 2;
  const y = center.y - height / 2;

  const newElement = buildImageElement({
    fileId,
    x,
    y,
    width,
    height,
    assetUrl: upload.blobUrl,
    altText,
  });
  const elements = excalidrawAPI.getSceneElements() as ReadonlyArray<unknown>;
  excalidrawAPI.updateScene({ elements: [...elements, newElement] });
  // Best-effort: nudge the viewport so the user sees what they just
  // inserted. Errors here are cosmetic; eat them.
  try {
    excalidrawAPI.scrollToContent?.([newElement], {
      fitToContent: false,
      animate: true,
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    elementId: (newElement as { id: string }).id,
    assetUrl: upload.blobUrl,
  };
}

/**
 * Insert a rendered LaTeX equation (an SVG blob) onto the canvas.
 *
 * The equation lives as an `image` element with mime `image/svg+xml`
 * so Excalidraw renders it crisply at any zoom. The original LaTeX
 * source is preserved in `customData.latex` so the AI note pipeline
 * can read the equation back as TeX (replay also pulls it out).
 */
export async function insertMathSvgOnCanvas(args: InsertAssetCommonArgs & {
  svgBlob: Blob;
  widthPx: number;
  heightPx: number;
  latex: string;
}): Promise<InsertImageResult> {
  const {
    excalidrawAPI,
    whiteboardSessionId,
    studentId,
    svgBlob,
    widthPx,
    heightPx,
    latex,
  } = args;

  const upload = await uploadWhiteboardAsset({
    whiteboardSessionId,
    studentId,
    blob: svgBlob,
    filename: "equation.svg",
    contentType: "image/svg+xml",
    assetTag: "math-equation",
  });
  if (!upload.ok) return { ok: false, reason: upload.error };

  let dataURL: string;
  try {
    dataURL = await blobToDataUrl(svgBlob);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  const fileId = makeRandomFileId();
  excalidrawAPI.addFiles([
    {
      id: fileId,
      mimeType: "image/svg+xml",
      dataURL,
      created: Date.now(),
    },
  ]);

  const center = viewportCenter(excalidrawAPI);
  const x = center.x - widthPx / 2;
  const y = center.y - heightPx / 2;
  const baseElement = buildImageElement({
    fileId,
    x,
    y,
    width: widthPx,
    height: heightPx,
    assetUrl: upload.blobUrl,
    altText: latex.slice(0, 200),
  });
  // Stitch the LaTeX source into customData so the canonical event
  // log carries it (the adapter reads `customData.latex` and lifts
  // it onto WBElement.latex).
  const newElement = {
    ...baseElement,
    customData: {
      ...((baseElement as { customData?: Record<string, unknown> })
        .customData ?? {}),
      latex,
      wbType: "text" as const,
    },
  };
  const elements = excalidrawAPI.getSceneElements() as ReadonlyArray<unknown>;
  excalidrawAPI.updateScene({ elements: [...elements, newElement] });
  try {
    excalidrawAPI.scrollToContent?.([newElement], {
      fitToContent: false,
      animate: true,
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    elementId: (newElement as unknown as { id: string }).id,
    assetUrl: upload.blobUrl,
  };
}

/**
 * Insert one image element per rendered PDF page, tiled vertically.
 * Pages are uploaded sequentially (matching the renderer's sequential
 * decode) so the network doesn't see 30 parallel POSTs.
 */
export async function insertPdfPagesOnCanvas(args: InsertAssetCommonArgs & {
  pages: PdfPageRender[];
  filename: string;
  onProgress?: (uploaded: number, total: number) => void;
}): Promise<InsertPdfResult> {
  const {
    excalidrawAPI,
    whiteboardSessionId,
    studentId,
    pages,
    filename,
    onProgress,
  } = args;

  if (pages.length === 0) {
    return { ok: false, reason: "No pages to insert." };
  }

  const center = viewportCenter(excalidrawAPI);
  // Anchor the top of the first page slightly above center so a 1-2
  // page PDF lands roughly centered, and a 30-page stack starts at
  // top-of-viewport rather than below it.
  let cursorY = center.y - PDF_PAGE_RENDER_WIDTH * 0.5;
  const x = center.x - PDF_PAGE_RENDER_WIDTH / 2;

  const elementIds: string[] = [];
  const assetUrls: string[] = [];
  const newElements: unknown[] = [];
  const filesToRegister: Array<{
    id: string;
    mimeType: "image/png";
    dataURL: string;
    created: number;
  }> = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pagePath = `${filename || "document"}-p${page.pageIndex}.png`;
    const upload = await uploadWhiteboardAsset({
      whiteboardSessionId,
      studentId,
      blob: page.pngBlob,
      filename: pagePath,
      contentType: "image/png",
      assetTag: `pdf-page-${page.pageIndex}`,
    });
    if (!upload.ok) {
      return {
        ok: false,
        reason: `Page ${page.pageIndex}: ${upload.error}`,
      };
    }

    let dataURL: string;
    try {
      dataURL = await blobToDataUrl(page.pngBlob);
    } catch (err) {
      return {
        ok: false,
        reason: `Page ${page.pageIndex}: ${(err as Error).message}`,
      };
    }

    const fileId = makeRandomFileId();
    filesToRegister.push({
      id: fileId,
      mimeType: "image/png",
      dataURL,
      created: Date.now(),
    });

    const aspect = page.heightPx / page.widthPx;
    const width = PDF_PAGE_RENDER_WIDTH;
    const height = width * aspect;

    const el = buildImageElement({
      fileId,
      x,
      y: cursorY,
      width,
      height,
      assetUrl: upload.blobUrl,
      altText: `${filename} page ${page.pageIndex}`,
    });
    newElements.push(el);
    elementIds.push((el as { id: string }).id);
    assetUrls.push(upload.blobUrl);

    cursorY += height + PDF_PAGE_GAP_PX;
    onProgress?.(i + 1, pages.length);
  }

  // Register all dataURLs at once and push the new elements as a
  // single scene update — keeps the live-sync broadcast to one frame.
  excalidrawAPI.addFiles(filesToRegister);
  const existing = excalidrawAPI.getSceneElements() as ReadonlyArray<unknown>;
  excalidrawAPI.updateScene({ elements: [...existing, ...newElements] });
  try {
    excalidrawAPI.scrollToContent?.([newElements[0]], {
      fitToContent: false,
      animate: true,
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    elementIds,
    assetUrls,
    pagesInserted: pages.length,
  };
}

// -------------------------------------------------------------------
// Desmos embed
// -------------------------------------------------------------------
//
// Excalidraw natively supports an `embeddable` element type that
// renders an `<iframe>` for a whitelisted URL. We insert one of those
// elements pointing at a Desmos calculator URL.
//
// The `embeddable` element shape is similar to `image`'s but uses
// `link` instead of `fileId`. We construct it directly (no Excalidraw
// type import) for the same reasons as `buildImageElement` above.
//
// Replay caveat — DOCUMENTED in `docs/WHITEBOARD-STATUS.md`:
//   The Desmos iframe runs as a live, interactive widget. The
//   canonical event log records the *URL* the tutor inserted (and any
//   move/resize), but does NOT capture intra-iframe state changes
//   (sliders dragged, equations toggled). Replay therefore shows the
//   iframe at its initial state. For a static record of a graph,
//   tutors should use the Save->URL flow inside Desmos and insert the
//   resulting permalink (which encodes the graph state in the URL).

/**
 * Default size for an inserted Desmos embed (CSS pixels, scene
 * coords). Roughly matches Desmos's recommended default
 * embed dimensions.
 */
const DESMOS_DEFAULT_WIDTH = 720;
const DESMOS_DEFAULT_HEIGHT = 540;

/** Hosts we accept for Desmos embeds. Used by both the toolbar
 * dialog and Excalidraw's `validateEmbeddable` prop. */
export const DESMOS_ALLOWED_HOSTS: ReadonlyArray<string> = [
  "www.desmos.com",
  "desmos.com",
];

/**
 * Validate (and lightly normalize) a Desmos URL. Returns the absolute
 * URL string we should hand to Excalidraw, or an error reason.
 *
 * Accepts:
 *   - https://www.desmos.com/calculator/<hash>          (saved graph)
 *   - https://www.desmos.com/calculator                  (blank)
 *   - https://www.desmos.com/scientific                  (sci. calc)
 *   - https://www.desmos.com/geometry/<hash>             (geometry)
 *
 * Rejects everything else — we don't want the toolbar to be a generic
 * iframe-anywhere injector.
 */
export function validateDesmosUrl(
  raw: string
): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "Enter a Desmos URL or pick 'New blank graph'." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "That doesn't look like a URL. Paste the full https:// link.",
    };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "Desmos URLs must use https://." };
  }
  if (!DESMOS_ALLOWED_HOSTS.includes(parsed.hostname)) {
    return {
      ok: false,
      reason: `Only Desmos URLs are accepted (got ${parsed.hostname}).`,
    };
  }
  // Strip fragments — Desmos uses hash-routing only for editor state
  // we wouldn't want to capture in customData (cursor position etc.)
  parsed.hash = "";
  return { ok: true, url: parsed.toString() };
}

/**
 * Build an Excalidraw `embeddable` element pointing at a Desmos URL.
 * Same omit-everything-non-essential approach as `buildImageElement`.
 */
function buildEmbeddableElement(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
  desmosKind: "calculator" | "scientific" | "geometry" | "saved";
}): Record<string, unknown> {
  const now = Date.now();
  return {
    id: makeRandomElementId(),
    type: "embeddable",
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    angle: 0,
    strokeColor: "#1e293b",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: args.url,
    locked: false,
    groupIds: [],
    frameId: null,
    roundness: null,
    customData: {
      assetUrl: args.url,
      // The adapter lifts wbType into the canonical event log so a
      // future replay (and the AI note pipeline) can distinguish
      // embeds from image elements without sniffing the URL.
      wbType: "embed",
      embed: {
        provider: "desmos",
        kind: args.desmosKind,
        url: args.url,
      },
    },
  };
}

export type InsertEmbedResult =
  | { ok: true; elementId: string; url: string }
  | { ok: false; reason: string };

/**
 * Insert a Desmos embeddable element at the current viewport center.
 * No upload step — the URL itself is the asset, and CSP handles the
 * rendering safety boundary.
 */
export function insertDesmosEmbedOnCanvas(args: InsertAssetCommonArgs & {
  url: string;
}): InsertEmbedResult {
  const { excalidrawAPI, url } = args;
  const validated = validateDesmosUrl(url);
  if (!validated.ok) return validated;

  // Detect the Desmos product from the path so the canonical event
  // log carries a sensible label (`saved` vs `calculator` etc.).
  const kind: "calculator" | "scientific" | "geometry" | "saved" = (() => {
    const parsed = new URL(validated.url);
    const segs = parsed.pathname.split("/").filter(Boolean);
    if (segs[0] === "scientific") return "scientific";
    if (segs[0] === "geometry") {
      return segs.length > 1 ? "saved" : "geometry";
    }
    if (segs[0] === "calculator") {
      return segs.length > 1 ? "saved" : "calculator";
    }
    return "calculator";
  })();

  const center = viewportCenter(excalidrawAPI);
  const x = center.x - DESMOS_DEFAULT_WIDTH / 2;
  const y = center.y - DESMOS_DEFAULT_HEIGHT / 2;
  const newElement = buildEmbeddableElement({
    x,
    y,
    width: DESMOS_DEFAULT_WIDTH,
    height: DESMOS_DEFAULT_HEIGHT,
    url: validated.url,
    desmosKind: kind,
  });

  const elements = excalidrawAPI.getSceneElements() as ReadonlyArray<unknown>;
  excalidrawAPI.updateScene({ elements: [...elements, newElement] });
  try {
    excalidrawAPI.scrollToContent?.([newElement], {
      fitToContent: false,
      animate: true,
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    elementId: (newElement as unknown as { id: string }).id,
    url: validated.url,
  };
}
