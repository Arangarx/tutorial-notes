"use client";

import {
  effectiveSegmentMaxSeconds,
  formatSegmentTimeLeft,
} from "@/lib/recording/segment-policy";
import MicControls, { type MicControlsProps } from "./MicControls";
import { formatDuration } from "./format-duration";

export type MainPanelProps = {
  /** FSM state from the hook — drives which sub-section renders. */
  state: "idle" | "acquiring" | "ready" | "recording" | "paused";
  /** External disabled (parent-driven, e.g. transcribe in progress). */
  disabled?: boolean;
  /** 1-based segment index — shown in the recording header. */
  segmentNumber: number;
  /** Elapsed seconds of the current segment. */
  elapsed: number;
  /** True when within the warning window before auto-rollover. */
  isWarning: boolean;

  /** All MicControls props passed straight through. */
  micControls: MicControlsProps;

  // Actions
  onStart: () => Promise<void> | void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
};

/**
 * The "live" recorder panel — visible whenever we're not in done/uploading/error.
 * Holds MicControls + either the Start button (idle/acquiring/ready) or the
 * Pause/Resume/Stop/Discard cluster (recording/paused).
 */
export default function MainPanel({
  state,
  disabled,
  segmentNumber,
  elapsed,
  isWarning,
  micControls,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
}: MainPanelProps) {
  return (
    <div data-testid="audio-record-panel">
      <MicControls {...micControls} />

      {(state === "idle" || state === "acquiring" || state === "ready") && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="btn primary"
            onClick={onStart}
            disabled={disabled || state === "acquiring"}
            aria-label="Start recording"
            data-testid="audio-record-start"
          >
            {state === "acquiring" ? "● Connecting…" : "● Start recording"}
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
            {state === "ready"
              ? "Speak — watch the level bar — then click Start."
              : `Long sessions auto-save every ~${Math.round(effectiveSegmentMaxSeconds() / 60)} min so you can keep recording. Speak at least 15–20 seconds per segment when possible.`}
          </span>
        </div>
      )}

      {(state === "recording" || state === "paused") && (
        <div data-testid="audio-record-controls">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background:
                  state === "recording"
                    ? "var(--color-error, #dc2626)"
                    : "var(--color-muted, #9ca3af)",
                animation: state === "recording" ? "pulse 1s infinite" : undefined,
              }}
            />
            <span
              aria-live="polite"
              aria-label={`Segment ${segmentNumber}, duration ${formatDuration(elapsed)}`}
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                fontSize: 18,
                color: isWarning ? "var(--color-error, #dc2626)" : undefined,
              }}
            >
              Part {segmentNumber} · {formatDuration(elapsed)}
            </span>
            {isWarning && (
              <span role="alert" style={{ fontSize: 12, color: "var(--color-error, #dc2626)" }}>
                {formatSegmentTimeLeft(effectiveSegmentMaxSeconds() - elapsed)} in this segment — will save &amp; continue automatically
              </span>
            )}
            <span
              aria-live="polite"
              style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-muted, #6b7280)" }}
            >
              {state === "paused" ? "Paused" : "Recording…"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {state === "recording" ? (
              <button
                type="button"
                className="btn"
                onClick={onPause}
                aria-label="Pause recording"
                data-testid="audio-record-pause"
              >
                ⏸ Pause
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={onResume}
                aria-label="Resume recording"
                data-testid="audio-record-resume"
              >
                ▶ Resume
              </button>
            )}
            {/* Wrap onStop in an arrow on the consumer side so the synthetic
                MouseEvent isn't passed as the `mode` argument — that
                regression was caught and fixed live; do not change to
                onClick={onStop} if `onStop` accepts an optional first arg. */}
            <button
              type="button"
              className="btn primary"
              onClick={onStop}
              aria-label="Stop and save recording"
              data-testid="audio-record-stop"
            >
              ■ Stop & save
            </button>
            <button
              type="button"
              className="btn"
              style={{ marginLeft: "auto" }}
              onClick={onReset}
              aria-label="Discard recording"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
