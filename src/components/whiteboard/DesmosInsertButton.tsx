"use client";

/**
 * Toolbar button + dialog for inserting a Desmos calculator embed
 * into the live whiteboard.
 *
 * Two flows:
 *
 *   1. "New blank graph"  -> inserts https://www.desmos.com/calculator
 *      The tutor and student see the same blank calculator and can
 *      type equations interactively. Replay shows a blank calculator
 *      (state is intra-iframe; not captured — see status doc).
 *
 *   2. "From URL"         -> tutor pastes a saved-graph URL, e.g.
 *      https://www.desmos.com/calculator/abc123. The graph state is
 *      encoded in the path, so refreshing the iframe always restores
 *      the same equations. This is the recommended flow for a
 *      "looks the same on replay" outcome.
 *
 * We deliberately do NOT support arbitrary iframe URLs (only Desmos
 * hosts pass `validateDesmosUrl`). The CSP `frame-src` mirror lives
 * in `next.config.ts`.
 */

import { useEffect, useRef, useState } from "react";
import {
  insertDesmosEmbedOnCanvas,
  validateDesmosUrl,
  type ExcalidrawApiLike,
} from "@/lib/whiteboard/insert-asset";

type Props = {
  excalidrawAPI: ExcalidrawApiLike | null;
  whiteboardSessionId: string;
  studentId: string;
  disabled?: boolean;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "open"; mode: "blank" | "url"; rawUrl: string; error: string | null };

const BLANK_CALCULATOR_URL = "https://www.desmos.com/calculator";

export function DesmosInsertButton({
  excalidrawAPI,
  whiteboardSessionId,
  studentId,
  disabled,
}: Props) {
  const [state, setState] = useState<DialogState>({ kind: "closed" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Pull the mode out into a stable, primitive dep so the linter can verify it.
  const dialogMode = state.kind === "open" ? state.mode : null;

  useEffect(() => {
    if (dialogMode === "url") {
      // Defer focus a tick so the input is mounted before we focus it.
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [dialogMode]);

  function open(mode: "blank" | "url") {
    setState({ kind: "open", mode, rawUrl: "", error: null });
  }
  function close() {
    setState({ kind: "closed" });
  }

  function handleInsertBlank() {
    if (!excalidrawAPI) return;
    const result = insertDesmosEmbedOnCanvas({
      excalidrawAPI,
      whiteboardSessionId,
      studentId,
      url: BLANK_CALCULATOR_URL,
    });
    if (!result.ok) {
      setState({
        kind: "open",
        mode: "blank",
        rawUrl: "",
        error: result.reason,
      });
      return;
    }
    close();
  }

  function handleInsertFromUrl() {
    if (state.kind !== "open" || state.mode !== "url") return;
    if (!excalidrawAPI) return;
    const validated = validateDesmosUrl(state.rawUrl);
    if (!validated.ok) {
      setState({ ...state, error: validated.reason });
      return;
    }
    const result = insertDesmosEmbedOnCanvas({
      excalidrawAPI,
      whiteboardSessionId,
      studentId,
      url: validated.url,
    });
    if (!result.ok) {
      setState({ ...state, error: result.reason });
      return;
    }
    close();
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => open("blank")}
        disabled={disabled || !excalidrawAPI}
        data-testid="wb-insert-desmos"
        title="Insert a Desmos graph"
      >
        Insert Desmos
      </button>

      {state.kind === "open" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wb-desmos-dialog-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
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
              width: "min(520px, 92vw)",
              padding: 20,
              // Solid dark surface — translucent .card --panel + dark page text
              // would render white-on-white over the modal backdrop.
              background: "#0d1328",
              border: "1px solid var(--border)",
              borderRadius: 8,
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 id="wb-desmos-dialog-title" style={{ margin: 0, fontSize: 16 }}>
                Insert a Desmos graph
              </h3>
              <button
                type="button"
                className="btn"
                onClick={close}
                aria-label="Close"
                style={{ padding: "2px 10px" }}
              >
                ×
              </button>
            </div>

            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className={state.mode === "blank" ? "btn primary" : "btn"}
                onClick={() => setState({ ...state, mode: "blank", error: null })}
                data-testid="wb-desmos-mode-blank"
              >
                New blank graph
              </button>
              <button
                type="button"
                className={state.mode === "url" ? "btn primary" : "btn"}
                onClick={() => setState({ ...state, mode: "url", error: null })}
                data-testid="wb-desmos-mode-url"
              >
                From URL
              </button>
            </div>

            {state.mode === "blank" && (
              <div style={{ display: "grid", gap: 8 }}>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Inserts a fresh Desmos calculator. You and your student
                  can type equations and drag sliders live.
                </p>
                <div
                  className="muted"
                  style={{
                    margin: 0,
                    fontSize: 12,
                    background: "rgba(234,179,8,0.10)",
                    border: "1px solid rgba(234,179,8,0.30)",
                    padding: "8px 10px",
                    borderRadius: 6,
                  }}
                >
                  Note: a blank calculator&apos;s state isn&apos;t recorded
                  to the session. Replay will show it blank. To preserve a
                  graph, build it on{" "}
                  <a
                    href="https://www.desmos.com/calculator"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    desmos.com/calculator
                  </a>
                  , click <strong>Save</strong>, copy the URL, and use
                  &quot;From URL&quot; here.
                </div>
              </div>
            )}

            {state.mode === "url" && (
              <div style={{ display: "grid", gap: 8 }}>
                <label htmlFor="wb-desmos-url" style={{ fontSize: 13, fontWeight: 600 }}>
                  Desmos URL
                </label>
                <input
                  ref={inputRef}
                  id="wb-desmos-url"
                  type="url"
                  value={state.rawUrl}
                  onChange={(e) =>
                    setState({ ...state, rawUrl: e.target.value, error: null })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleInsertFromUrl();
                    }
                  }}
                  placeholder="https://www.desmos.com/calculator/abcdefghij"
                  style={{
                    padding: "8px 10px",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                  data-testid="wb-desmos-url-input"
                />
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                  Paste a saved-graph URL from Desmos. The graph state
                  is encoded in the URL, so it will look the same on
                  replay.
                </p>
              </div>
            )}

            {state.error && (
              <div
                role="alert"
                style={{
                  background: "rgba(220,38,38,0.10)",
                  border: "1px solid rgba(220,38,38,0.30)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 13,
                  color: "#b91c1c",
                }}
                data-testid="wb-desmos-error"
              >
                {state.error}
              </div>
            )}

            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={
                  state.mode === "blank" ? handleInsertBlank : handleInsertFromUrl
                }
                data-testid="wb-desmos-insert"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
