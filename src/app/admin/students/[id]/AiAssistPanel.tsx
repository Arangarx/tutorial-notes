"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { generateNoteFromTextAction, transcribeAndGenerateAction } from "./actions";
import type { NewNoteFormHandle } from "./NewNoteForm";
import AudioInputTabs, { type AudioResult } from "./AudioInputTabs";

type Tab = "text" | "upload" | "record";

/**
 * <audio> element that works around Chrome's MediaRecorder WebM bug.
 *
 * MediaRecorder writes a streaming WebM container with no duration in the
 * header, so the native <audio controls> shows "0:00 / 0:00" and refuses to
 * seek; in some Chromium versions clicking play does nothing at all.
 *
 * Standard fix: when metadata loads with duration=Infinity/NaN, jump
 * currentTime to a huge value. The browser scans to the actual end, fires
 * `durationchange` with the real duration, then we reset to 0.
 *
 * IMPORTANT: this hack is WebM-specific. iOS Safari uses MP4 and either
 * throws or enters an error state when assigning a wildly out-of-range
 * currentTime to a freshly loaded audio element. We gate the hack on the
 * mime type, wrap the assignment in try/catch, and surface a friendly
 * fallback message if the audio element fires `error` instead of loading.
 *
 * Reference: https://bugs.chromium.org/p/chromium/issues/detail?id=642012
 */
function AudioPreview({ src, mimeType }: { src: string; mimeType?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [needsFix, setNeedsFix] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isWebm = mimeType?.toLowerCase().includes("webm") ?? false;

  useEffect(() => {
    setNeedsFix(false);
    setHasError(false);
  }, [src]);

  function handleLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isWebm) return; // MP4 / m4a / mp3 already report correct duration
    if (!Number.isFinite(audio.duration) || audio.duration === 0) {
      setNeedsFix(true);
      try {
        audio.currentTime = 1e101;
      } catch {
        // Some browsers throw on out-of-range currentTime — harmless, the
        // user can still press play and it will work.
        setNeedsFix(false);
      }
    }
  }

  function handleDurationChange() {
    const audio = audioRef.current;
    if (!audio || !needsFix) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore — we just wanted to reset playback position.
      }
      setNeedsFix(false);
    }
  }

  if (hasError) {
    return (
      <p
        style={{ margin: 0, fontSize: 12, color: "var(--color-muted, #6b7280)" }}
        data-testid="audio-preview-error"
      >
        Preview unavailable in this browser, but the recording was saved and can
        still be transcribed below.
      </p>
    );
  }

  return (
    <audio
      ref={audioRef}
      controls
      preload="metadata"
      src={src}
      onLoadedMetadata={handleLoadedMetadata}
      onDurationChange={handleDurationChange}
      onError={() => setHasError(true)}
      aria-label="Preview of uploaded or recorded audio"
      style={{ width: "100%", height: 36 }}
      data-testid="audio-preview"
    />
  );
}

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
  const [pendingAudio, setPendingAudio] = useState<AudioResult | null>(null);
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [audioTabsKey, setAudioTabsKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
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
    if (!checkOverwrite()) return;

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
        links: result.links,
        promptVersion: result.promptVersion,
        recordingId: undefined,
      });
      setPanelState("filled");
    });
  }

  function handleGenerateFromAudio() {
    if (!pendingAudio) return;
    setError(null);
    setWarning(null);
    if (!checkOverwrite()) return;

    startTransition(async () => {
      const result = await transcribeAndGenerateAction(
        studentId,
        pendingAudio.blobUrl,
        pendingAudio.mimeType
      );
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
        recordingId: result.recordingId,
      });
      if (result.warning) setWarning(result.warning);
      setPanelState("filled");
    });
  }

  function handleRegenerate() {
    setPanelState("idle");
    setSessionText("");
    setError(null);
    setWarning(null);
    setPendingAudio(null);
    setAudioTabsKey((k) => k + 1);
    formRef.current?.clear();
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleClearAudio() {
    setPendingAudio(null);
    setAudioTabsKey((k) => k + 1);
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
            {warning ? "Form partially filled — please review." : "Form filled — review and save."}
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

          <AudioInputTabs
            key={audioTabsKey}
            studentId={studentId}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onAudioReady={setPendingAudio}
            onAudioCleared={() => setPendingAudio(null)}
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

          {pendingAudio?.previewUrl && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
                Preview recording before transcribing:
              </p>
              <AudioPreview
                src={pendingAudio.previewUrl}
                mimeType={pendingAudio.mimeType}
              />
            </div>
          )}

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            {pendingAudio && (
              <button
                type="button"
                className="btn"
                style={{ marginRight: "auto", fontSize: 12 }}
                onClick={handleClearAudio}
                disabled={isPending}
              >
                × Clear audio
              </button>
            )}
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
                disabled={isPending || !pendingAudio}
                onClick={handleGenerateFromAudio}
                data-testid="ai-transcribe-btn"
              >
                {isPending
                  ? "Transcribing…"
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
