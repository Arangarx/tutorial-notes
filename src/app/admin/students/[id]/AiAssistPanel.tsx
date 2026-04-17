"use client";

import { useState, useRef, useTransition } from "react";
import { generateNoteFromTextAction } from "./actions";
import type { NewNoteFormHandle } from "./NewNoteForm";

type Props = {
  studentId: string;
  formRef: React.RefObject<NewNoteFormHandle | null>;
  /** Whether the AI feature is enabled (OPENAI_API_KEY configured). */
  enabled: boolean;
};

type PanelState = "idle" | "filled";

export default function AiAssistPanel({ studentId, formRef, enabled }: Props) {
  const [sessionText, setSessionText] = useState("");
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleGenerate() {
    setError(null);

    // Check if the form already has content the user typed (don't silently clobber).
    const hasContent = formRef.current?.hasUserContent() ?? false;
    if (hasContent) {
      const confirmed = window.confirm(
        "Replace your edits with AI suggestions?\n\nYour current entries will be overwritten."
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const result = await generateNoteFromTextAction(studentId, sessionText);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.populate({
        topics: result.topics,
        homework: result.homework,
        nextSteps: result.nextSteps,
        promptVersion: result.promptVersion,
      });
      setPanelState("filled");
    });
  }

  function handleRegenerate() {
    setPanelState("idle");
    setError(null);
    // Focus back to the textarea so tutor can adjust their notes
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  if (!enabled) {
    return (
      <div className="card" style={{ opacity: 0.6 }}>
        <h3 style={{ marginTop: 0 }}>Auto-fill from session text</h3>
        <p className="muted" style={{ margin: 0 }}>
          AI generation is not configured on this server.
        </p>
      </div>
    );
  }

  return (
    <div className="card" data-testid="ai-assist-panel">
      <h3 style={{ marginTop: 0 }}>Auto-fill from session text</h3>
      <p className="muted" style={{ marginTop: 0, marginBottom: 4 }}>
        Paste or type what you covered. The AI will fill the form below — you can edit before
        saving.
      </p>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: 12 }}>
        Your text is sent to OpenAI to structure it.{" "}
        <a
          href="https://openai.com/enterprise-privacy"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12 }}
        >
          OpenAI does not use API data for training.
        </a>
      </p>

      {panelState === "filled" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            background: "var(--color-success-bg, #f0fdf4)",
            borderRadius: 6,
            border: "1px solid var(--color-success-border, #bbf7d0)",
          }}
          data-testid="ai-filled-hint"
        >
          <span style={{ color: "var(--color-success, #16a34a)", fontWeight: 600 }}>
            Filled in below — review and save.
          </span>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: "auto", fontSize: 13 }}
            onClick={handleRegenerate}
          >
            Re-generate
          </button>
        </div>
      ) : (
        <>
          <textarea
            ref={textareaRef}
            value={sessionText}
            onChange={(e) => setSessionText(e.target.value)}
            rows={4}
            placeholder="e.g. We worked on quadratic equations, factoring practice with worksheet pg 4-6, she struggled with negative coefficients..."
            style={{ width: "100%", boxSizing: "border-box" }}
            data-testid="ai-session-text"
          />

          {error && (
            <p style={{ color: "var(--color-error, #dc2626)", marginTop: 8 }}>{error}</p>
          )}

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            <button
              type="button"
              className="btn primary"
              disabled={isPending || !sessionText.trim()}
              onClick={handleGenerate}
              data-testid="ai-generate-btn"
            >
              {isPending ? "Generating…" : error ? "Try again" : "Generate notes"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
