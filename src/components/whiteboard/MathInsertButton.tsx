"use client";

/**
 * Whiteboard "Insert math" toolbar button + dialog.
 *
 * Flow:
 *
 *   1. Tutor clicks "Insert math" — a modal opens with a MathLive
 *      `<math-field>` (WYSIWYG LaTeX editor).
 *   2. The tutor types/pastes their equation. The dialog also shows
 *      the raw LaTeX in a small read-only field for copy-out.
 *   3. On Insert, we hand the LaTeX to `renderLatexToSvg` (MathJax
 *      via the lite adaptor), upload the SVG asset, register it with
 *      Excalidraw, and drop an image element on the canvas.
 *   4. The image element carries `customData.latex` so the AI note
 *      pipeline + replay both see the original source.
 *
 * MathLive notes:
 *
 *   - We import the `mathlive` package dynamically from `useEffect`.
 *     The package self-registers a `<math-field>` custom element on
 *     window.customElements; we wait for that registration before
 *     mounting the field. Without the wait, React hydrates the
 *     element when it's still an HTMLUnknownElement and value
 *     reads come back empty.
 *   - The MathLive bundle is large (~1MB raw); dynamic-importing it
 *     keeps the workspace shell instant for sessions that never
 *     open the math dialog.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  insertMathSvgOnCanvas,
  type ExcalidrawApiLike,
} from "@/lib/whiteboard/insert-asset";
import { renderLatexToSvg } from "@/lib/whiteboard/math-render";

type Props = {
  excalidrawAPI: ExcalidrawApiLike | null;
  whiteboardSessionId: string;
  studentId: string;
  disabled?: boolean;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "open" }
  | { kind: "rendering" }
  | { kind: "error"; message: string }
  | { kind: "success" };

export function MathInsertButton({
  excalidrawAPI,
  whiteboardSessionId,
  studentId,
  disabled,
}: Props) {
  const [state, setState] = useState<DialogState>({ kind: "closed" });
  const [latex, setLatex] = useState<string>("");
  const [mathLiveReady, setMathLiveReady] = useState(false);
  const fieldHostRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLElement | null>(null);

  // Lazy-load MathLive when the dialog first opens. Subsequent opens
  // reuse the registered custom element.
  useEffect(() => {
    if (state.kind === "closed") return;
    if (mathLiveReady) return;
    let cancelled = false;
    void (async () => {
      try {
        await import("mathlive");
        if (typeof window === "undefined") return;
        // mathlive 0.109 registers the element synchronously on
        // import, but on slower devices the registration callback
        // can land in a microtask — wait for `customElements.get`
        // to confirm before marking ready.
        if (!window.customElements?.get("math-field")) {
          await new Promise<void>((resolve) => {
            const onDef = () => {
              if (window.customElements?.get("math-field")) resolve();
            };
            // whenDefined returns a promise that resolves when
            // the element is defined.
            window.customElements
              ?.whenDefined("math-field")
              .then(onDef, onDef);
          });
        }
        if (!cancelled) setMathLiveReady(true);
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: `Could not load the math editor: ${(err as Error).message}`,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.kind, mathLiveReady]);

  // Mount the <math-field> after MathLive registers — we create the
  // element imperatively because React's JSX type checker doesn't
  // know about it without a global declaration, and the value-binding
  // story is cleaner via the imperative API anyway.
  useEffect(() => {
    if (!mathLiveReady) return;
    if (state.kind === "closed") return;
    const host = fieldHostRef.current;
    if (!host) return;
    const field = document.createElement("math-field");
    field.setAttribute("style", "min-height: 60px; font-size: 22px; width: 100%;");
    field.setAttribute("aria-label", "Equation editor");
    if (latex) field.setAttribute("value", latex);
    host.innerHTML = "";
    host.appendChild(field);
    fieldRef.current = field;
    const onInput = () => {
      const v = (field as unknown as { value?: string }).value ?? "";
      setLatex(v);
    };
    field.addEventListener("input", onInput);
    // Move focus into the field so the tutor can start typing.
    requestAnimationFrame(() => {
      try {
        (field as unknown as { focus?: () => void }).focus?.();
      } catch {
        // ignore
      }
    });
    return () => {
      field.removeEventListener("input", onInput);
      // Don't tear down the field on every keystroke — only when the
      // dialog itself unmounts. The cleanup that fires on dialog
      // close clears the host below.
    };
    // We intentionally exclude `latex` from the deps: re-mounting on
    // every keystroke would steal focus + lose cursor position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mathLiveReady, state.kind]);

  const close = useCallback(() => {
    setState({ kind: "closed" });
    setLatex("");
    if (fieldHostRef.current) fieldHostRef.current.innerHTML = "";
    fieldRef.current = null;
  }, []);

  const handleInsert = useCallback(async () => {
    if (!excalidrawAPI) {
      setState({ kind: "error", message: "Whiteboard isn't ready yet." });
      return;
    }
    const trimmed = latex.trim();
    if (!trimmed) {
      setState({ kind: "error", message: "Equation is empty." });
      return;
    }
    setState({ kind: "rendering" });
    const render = await renderLatexToSvg(trimmed, { displayMode: true });
    if (!render.ok) {
      setState({ kind: "error", message: render.reason });
      return;
    }
    const inserted = await insertMathSvgOnCanvas({
      excalidrawAPI,
      whiteboardSessionId,
      studentId,
      svgBlob: render.svgBlob,
      widthPx: render.widthPx,
      heightPx: render.heightPx,
      latex: trimmed,
    });
    if (!inserted.ok) {
      setState({ kind: "error", message: inserted.reason });
      return;
    }
    setState({ kind: "success" });
    setTimeout(() => {
      setState((curr) => (curr.kind === "success" ? { kind: "closed" } : curr));
      setLatex("");
      if (fieldHostRef.current) fieldHostRef.current.innerHTML = "";
      fieldRef.current = null;
    }, 800);
  }, [excalidrawAPI, latex, studentId, whiteboardSessionId]);

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => setState({ kind: "open" })}
        disabled={disabled || !excalidrawAPI}
        data-testid="wb-insert-math-btn"
        title="Insert a math equation"
      >
        Insert math
      </button>

      {state.kind !== "closed" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wb-math-title"
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
              maxWidth: 620,
              width: "calc(100% - 32px)",
              padding: 24,
              background: "var(--color-surface, #fff)",
              display: "grid",
              gap: 12,
            }}
            data-testid="wb-math-dialog"
          >
            <h3 id="wb-math-title" style={{ marginTop: 0 }}>
              Insert math equation
            </h3>
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              Type or paste an equation in LaTeX or use the on-screen
              keyboard. The equation is added to the canvas as an
              image; the LaTeX source is preserved for AI notes.
            </p>

            {!mathLiveReady && state.kind !== "error" && (
              <div className="muted" style={{ fontSize: 13 }}>
                Loading math editor…
              </div>
            )}

            <div
              ref={fieldHostRef}
              style={{
                border: "1px solid rgba(100,116,139,0.3)",
                borderRadius: 8,
                padding: 8,
                minHeight: 80,
                background: "white",
              }}
              data-testid="wb-math-field-host"
            />

            <details>
              <summary style={{ cursor: "pointer", fontSize: 13 }}>
                LaTeX source
              </summary>
              <textarea
                value={latex}
                onChange={(e) => {
                  const v = e.target.value;
                  setLatex(v);
                  if (fieldRef.current) {
                    (fieldRef.current as unknown as { value?: string }).value =
                      v;
                  }
                }}
                rows={3}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: 13,
                  marginTop: 6,
                }}
                data-testid="wb-math-latex-input"
                placeholder="\\frac{a}{b} = c"
              />
            </details>

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
                Equation inserted.
              </div>
            )}

            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleInsert}
                disabled={state.kind === "rendering" || !latex.trim()}
                data-testid="wb-math-insert-btn"
              >
                {state.kind === "rendering" ? "Rendering…" : "Insert"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
