"use client";

import { useRef, useState, useTransition } from "react";
import { formatUserFacingActionError } from "@/lib/action-correlation";
import { generateNoteFromTextAction, transcribeAndGenerateAction } from "./actions";
import type { NewNoteFormHandle } from "./NewNoteForm";
import AudioInputTabs, { type AudioResult } from "./AudioInputTabs";
import PendingSegmentList from "./PendingSegmentList";

type Tab = "text" | "upload" | "record";

type Props = {
  studentId: string;
  formRef: React.RefObject<NewNoteFormHandle | null>;
  /** Whether the AI feature is enabled (OPENAI_API_KEY configured). */
  enabled: boolean;
  /** Whether blob storage is configured (BLOB_READ_WRITE_TOKEN present). */
  blobEnabled: boolean;
};

type PanelState = "idle" | "filled";

export default function AiAssistPanel({ studentId, formRef, enabled, blobEnabled }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("text");
  const [sessionText, setSessionText] = useState("");
  const [pendingAudios, setPendingAudios] = useState<AudioResult[]>([]);
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [audioTabsKey, setAudioTabsKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [warningKind, setWarningKind] = useState<"skipped-only" | "ai-fallback" | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function checkOverwrite(): boolean {
    const hasContent = formRef.current?.hasUserContent() ?? false;
    if (hasContent) {
      return window.confirm(
        "Replace your edits with AI suggestions?\n\nYour current entries will be overwritten."
      );
    }
    return true;
  }

  function handleGenerateFromText() {
    setError(null);
    setWarning(null);
    setWarningKind(null);
    if (!checkOverwrite()) return;

    startTransition(async () => {
      try {
        const result = await generateNoteFromTextAction(studentId, sessionText);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        formRef.current?.populate({
          topics: result.topics,
          homework: result.homework,
          nextSteps: result.nextSteps,
          links: result.links,
          promptVersion: result.promptVersion,
          recordingIds: [],
        });
        setPanelState("filled");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AiAssistPanel] generateNoteFromTextAction threw:", err);
        setError(
          `Request failed before the server finished (${msg}). Check your connection and try again.`
        );
      }
    });
  }

  function handleGenerateFromAudio() {
    if (pendingAudios.length === 0) return;
    setError(null);
    setWarning(null);
    setWarningKind(null);
    if (!checkOverwrite()) return;

    startTransition(async () => {
      try {
        const payload = pendingAudios.map((a) => ({ blobUrl: a.blobUrl, mimeType: a.mimeType }));
        let result = await transcribeAndGenerateAction(studentId, payload);
        if (
          !result.ok &&
          /brief database|database hiccup/i.test(result.error)
        ) {
          await new Promise((r) => setTimeout(r, 700));
          result = await transcribeAndGenerateAction(studentId, payload);
        }
        if (!result.ok) {
          setError(formatUserFacingActionError(result.error, result.debugId));
          return;
        }
        formRef.current?.populate({
          topics: result.topics,
          homework: result.homework,
          nextSteps: result.nextSteps,
          links: result.links,
          promptVersion: result.promptVersion,
          recordingIds: result.recordingIds,
          sessionStartedAt: result.sessionStartedAt,
          sessionEndedAt: result.sessionEndedAt,
        });
        if (result.warning) setWarning(result.warning);
        if (result.warningKind) setWarningKind(result.warningKind);
        setPanelState("filled");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AiAssistPanel] transcribeAndGenerateAction threw:", err);
        setError(
          `Request failed before the server finished (${msg}). On iPhone, try the Upload tab instead of Record, or use Wi‑Fi.`
        );
      }
    });
  }

  function handleRegenerate() {
    setPanelState("idle");
    setSessionText("");
    setError(null);
    setWarning(null);
    setWarningKind(null);
    setPendingAudios([]);
    setIsRecordingActive(false);
    setAudioTabsKey((k) => k + 1);
    formRef.current?.clear();
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleAudioReady(
    audio: AudioResult,
    meta?: { keepRecorderMounted?: boolean }
  ) {
    setPendingAudios((prev) => [...prev, audio]);
    // Remount the audio tabs after a normal upload/record so the input resets.
    // Auto-rollover segments append without remounting so the mic stays hot.
    if (!meta?.keepRecorderMounted) {
      setAudioTabsKey((k) => k + 1);
    }
  }

  function handleRemoveSegment(index: number) {
    setPendingAudios((prev) => prev.filter((_, i) => i !== index));
  }

  if (!enabled) {
    return (
      <div className="card" style={{ opacity: 0.6 }}>
        <h3 style={{ marginTop: 0 }}>Auto-fill from session</h3>
        <p className="muted" style={{ margin: 0 }}>
          AI generation is not configured on this server.
        </p>
      </div>
    );
  }

  return (
    <div className="card" data-testid="ai-assist-panel" style={{ flex: 1, minWidth: 280 }}>
      <h3 style={{ marginTop: 0 }}>Auto-fill from session</h3>

      {panelState === "filled" ? (
        <div
          style={{
            padding: "12px 14px",
            background: warning
              ? "var(--color-warning-bg, #fefce8)"
              : "var(--color-success-bg, #f0fdf4)",
            borderRadius: 6,
            border: warning
              ? "1px solid var(--color-warning-border, #fde68a)"
              : "1px solid var(--color-success-border, #bbf7d0)",
          }}
          data-testid="ai-filled-hint"
        >
          <span
            style={{
              color: warning
                ? "var(--color-warning, #a16207)"
                : "var(--color-success, #16a34a)",
              fontWeight: 600,
              display: "block",
              marginBottom: warning ? 6 : 10,
            }}
            role="status"
          >
            {!warning
              ? "Form filled — review and save."
              : warningKind === "ai-fallback"
              ? "Form needs your edits — please review."
              : "Form filled — heads up below."}
          </span>
          {warning && (
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 13,
                color: "var(--color-warning, #a16207)",
                lineHeight: 1.4,
              }}
              data-testid="ai-warning"
            >
              {warning}
            </p>
          )}
          <button
            type="button"
            className="btn"
            style={{ fontSize: 13 }}
            onClick={handleRegenerate}
          >
            Start over
          </button>
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0, marginBottom: 4 }}>
            Paste notes, upload a recording, or record directly. AI will fill the note form — you
            can edit before saving.
          </p>
          <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: 12 }}>
            Your text/audio is sent to OpenAI to structure it.{" "}
            <a
              href="https://openai.com/enterprise-privacy"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12 }}
            >
              OpenAI does not use API data for training.
            </a>
          </p>

          <PendingSegmentList
            audios={pendingAudios}
            onRemove={handleRemoveSegment}
            disabled={isPending}
          />

          <AudioInputTabs
            key={audioTabsKey}
            studentId={studentId}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onAudioReady={handleAudioReady}
            onAudioCleared={() => {/* segments list handles removal */}}
            onRecordingActive={setIsRecordingActive}
            disabled={isPending}
            blobEnabled={blobEnabled}
          />

          {activeTab === "text" && (
            <>
              <label htmlFor="ai-session-text" className="muted" style={{ fontSize: 12, marginBottom: 4, display: "block" }}>
                Session notes
              </label>
              <textarea
                id="ai-session-text"
                ref={textareaRef}
                value={sessionText}
                onChange={(e) => setSessionText(e.target.value)}
                rows={4}
                placeholder="e.g. We worked on quadratic equations, factoring practice with worksheet pg 4-6, she struggled with negative coefficients..."
                style={{ width: "100%", boxSizing: "border-box", marginTop: 2 }}
                data-testid="ai-session-text"
              />
            </>
          )}

          {error && (
            <p role="alert" style={{ color: "var(--color-error, #dc2626)", marginTop: 8 }}>{error}</p>
          )}

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            {activeTab === "text" ? (
              <button
                type="button"
                className="btn primary"
                disabled={isPending || !sessionText.trim()}
                onClick={handleGenerateFromText}
                data-testid="ai-generate-btn"
              >
                {isPending ? "Generating…" : error ? "Try again" : "Generate notes"}
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                disabled={isPending || isRecordingActive || pendingAudios.length === 0}
                onClick={handleGenerateFromAudio}
                data-testid="ai-transcribe-btn"
                title={isRecordingActive ? "Stop the recording first" : undefined}
              >
                {isPending
                  ? `Transcribing${pendingAudios.length > 1 ? ` ${pendingAudios.length} segments` : ""}…`
                  : error
                  ? "Try again"
                  : "Transcribe & generate notes"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
