"use client";

/**
 * Whiteboard "Insert PDF or image" toolbar button.
 *
 * One button covers both flows because Sarah's mental model (per the
 * plan questionnaire) is "I want to put my worksheet on the board" —
 * she doesn't sort PDF vs PNG vs JPG. The component looks at the file
 * extension and routes to the right path:
 *
 *   - `application/pdf` -> renderPdfFileToPngs() -> insertPdfPagesOnCanvas()
 *   - any whitelisted image mime -> insertImageOnCanvas()
 *
 * The dialog surfaces:
 *   - The 30-page / 25 MB / iOS warning copy BEFORE the file picker
 *     so the tutor can pick a smaller PDF without burning a render.
 *   - A live progress strip while pdfjs renders pages.
 *   - A clear error banner if anything failed at any stage.
 *
 * The `excalidrawAPI` prop comes from the workspace component's
 * `excalidrawAPI` callback — we don't try to grab it ourselves
 * because there's no global handle and the API ref is component-
 * scoped.
 */

import { useCallback, useRef, useState } from "react";
import {
  ExcalidrawApiLike,
  insertImageOnCanvas,
  insertPdfPagesOnCanvas,
} from "@/lib/whiteboard/insert-asset";
import {
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  isLikelyIOSSafari,
  renderPdfFileToPngs,
  type PdfRenderProgress,
} from "@/lib/whiteboard/pdf-render";

type Props = {
  excalidrawAPI: ExcalidrawApiLike | null;
  whiteboardSessionId: string;
  studentId: string;
  /** Disables the button (e.g. while session is ending). */
  disabled?: boolean;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "open" }
  | { kind: "loading"; message: string }
  | {
      kind: "rendering";
      pageIndex: number;
      totalPages: number;
    }
  | {
      kind: "uploading";
      uploaded: number;
      total: number;
    }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const PDF_MIME = "application/pdf";
const ACCEPT_ATTR = [
  PDF_MIME,
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
].join(",");

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfImageUploadButton({
  excalidrawAPI,
  whiteboardSessionId,
  studentId,
  disabled,
}: Props) {
  const [state, setState] = useState<DialogState>({ kind: "closed" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancellationRef = useRef<{ aborted: boolean }>({ aborted: false });

  const showIOSWarning = isLikelyIOSSafari();

  const reset = useCallback(() => {
    cancellationRef.current.aborted = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const close = useCallback(() => {
    cancellationRef.current.aborted = true;
    setState({ kind: "closed" });
    reset();
  }, [reset]);

  const handleFileChosen = useCallback(
    async (file: File) => {
      if (!excalidrawAPI) {
        setState({
          kind: "error",
          message: "Whiteboard isn't ready yet — wait a second and try again.",
        });
        return;
      }
      reset();

      const isPdf = file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        setState({ kind: "loading", message: "Reading PDF…" });
        const result = await renderPdfFileToPngs(file, {
          cancellation: cancellationRef.current,
          onProgress: (p: PdfRenderProgress) => {
            if (cancellationRef.current.aborted) return;
            if (p.phase === "loading") {
              setState({ kind: "loading", message: "Reading PDF…" });
            } else if (p.phase === "rendering") {
              setState({
                kind: "rendering",
                pageIndex: p.pageIndex ?? 0,
                totalPages: p.totalPages ?? 0,
              });
            }
          },
        });
        if (!result.ok) {
          setState({ kind: "error", message: result.message });
          return;
        }
        setState({
          kind: "uploading",
          uploaded: 0,
          total: result.pages.length,
        });
        const insertResult = await insertPdfPagesOnCanvas({
          excalidrawAPI,
          whiteboardSessionId,
          studentId,
          pages: result.pages,
          filename: file.name,
          onProgress: (uploaded, total) => {
            if (cancellationRef.current.aborted) return;
            setState({ kind: "uploading", uploaded, total });
          },
        });
        if (!insertResult.ok) {
          setState({ kind: "error", message: insertResult.reason });
          return;
        }
        const truncatedSuffix = result.truncated
          ? ` (first ${result.pages.length} of ${result.totalPagesInPdf} pages)`
          : "";
        setState({
          kind: "success",
          message: `Inserted ${insertResult.pagesInserted} page${insertResult.pagesInserted === 1 ? "" : "s"}${truncatedSuffix}.`,
        });
        // Close the dialog after a short pause so the success copy is
        // visible but doesn't block the canvas indefinitely.
        setTimeout(() => {
          setState((current) =>
            current.kind === "success" ? { kind: "closed" } : current
          );
        }, 1800);
        return;
      }

      // Image branch
      setState({ kind: "loading", message: "Inserting image…" });
      const insertResult = await insertImageOnCanvas({
        excalidrawAPI,
        whiteboardSessionId,
        studentId,
        file,
        altText: file.name,
      });
      if (!insertResult.ok) {
        setState({ kind: "error", message: insertResult.reason });
        return;
      }
      setState({ kind: "success", message: "Image inserted." });
      setTimeout(() => {
        setState((current) =>
          current.kind === "success" ? { kind: "closed" } : current
        );
      }, 1500);
    },
    [excalidrawAPI, reset, studentId, whiteboardSessionId]
  );

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => setState({ kind: "open" })}
        disabled={disabled || !excalidrawAPI}
        data-testid="wb-insert-asset-btn"
        title="Insert PDF or image"
      >
        Insert PDF / image
      </button>

      {state.kind !== "closed" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wb-insert-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 540,
              width: "calc(100% - 32px)",
              padding: 24,
              background: "var(--color-surface, #fff)",
              display: "grid",
              gap: 12,
            }}
            data-testid="wb-insert-dialog"
          >
            <h3 id="wb-insert-title" style={{ marginTop: 0 }}>
              Insert PDF or image
            </h3>
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              PDFs are rendered as one image per page (up to{" "}
              <strong>{PDF_MAX_PAGES} pages</strong>) and tiled
              vertically on the canvas. Images are placed at the
              center of the current view.
            </p>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Maximum file size: <strong>{fmtBytes(PDF_MAX_BYTES)}</strong>.
              Supported types: PDF, PNG, JPG, GIF, WebP, SVG.
            </p>

            {showIOSWarning && (
              <div
                role="note"
                style={{
                  fontSize: 13,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(234,179,8,0.12)",
                  border: "1px solid rgba(234,179,8,0.4)",
                }}
              >
                <strong>iPhone/iPad note:</strong> Safari on iOS limits
                memory per tab. If you're inserting a long PDF (more than
                ~10 colour pages), the tab may run out of memory mid-render.
                Pick a smaller PDF or split into chunks.
              </div>
            )}

            {state.kind === "open" && (
              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="wb-insert-pick-file"
                >
                  Choose file…
                </button>
              </div>
            )}

            {(state.kind === "loading" ||
              state.kind === "rendering" ||
              state.kind === "uploading") && (
              <ProgressStrip state={state} />
            )}

            {state.kind === "error" && (
              <div
                role="alert"
                style={{
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(220,38,38,0.12)",
                  border: "1px solid rgba(220,38,38,0.4)",
                }}
              >
                {state.message}
              </div>
            )}

            {state.kind === "success" && (
              <div
                role="status"
                style={{
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(34,197,94,0.12)",
                  border: "1px solid rgba(34,197,94,0.4)",
                }}
              >
                {state.message}
              </div>
            )}

            {(state.kind === "error" || state.kind === "success") && (
              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                {state.kind === "error" && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setState({ kind: "open" })}
                  >
                    Try another file
                  </button>
                )}
                <button type="button" className="btn" onClick={close}>
                  Close
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleFileChosen(file);
                }
              }}
              data-testid="wb-insert-file-input"
            />
          </div>
        </div>
      )}
    </>
  );
}

function ProgressStrip({ state }: { state: DialogState }) {
  let label = "";
  let percent = 0;
  if (state.kind === "loading") {
    label = state.message;
    percent = 5;
  } else if (state.kind === "rendering") {
    label = `Rendering page ${state.pageIndex} of ${state.totalPages}…`;
    percent = state.totalPages > 0
      ? Math.min(95, Math.round((state.pageIndex / state.totalPages) * 95))
      : 5;
  } else if (state.kind === "uploading") {
    label = `Uploading page ${state.uploaded} of ${state.total}…`;
    percent = state.total > 0
      ? Math.round((state.uploaded / state.total) * 100)
      : 0;
  }
  return (
    <div data-testid="wb-insert-progress" style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 13 }}>{label}</div>
      <div
        aria-hidden="true"
        style={{
          height: 6,
          borderRadius: 999,
          background: "rgba(100,116,139,0.2)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "#2563eb",
            transition: "width 200ms ease",
          }}
        />
      </div>
    </div>
  );
}
