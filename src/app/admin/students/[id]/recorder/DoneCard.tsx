"use client";

import { formatDuration } from "./format-duration";

export type DoneCardProps = {
  /** Last segment's duration (shown on the green success card). */
  doneSegmentSeconds: number;
  /** Click handler for the Re-record button — typically `r.handleReset`. */
  onReset: () => void;
};

/**
 * Success card shown after Stop & save. Pure presentational; the recorder hook
 * owns the state that drives `doneSegmentSeconds` + the reset action.
 */
export default function DoneCard({ doneSegmentSeconds, onReset }: DoneCardProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: "var(--color-success-bg, #f0fdf4)",
        borderRadius: 6,
        border: "1px solid var(--color-success-border, #bbf7d0)",
      }}
      data-testid="audio-record-done"
    >
      <span style={{ color: "var(--color-success, #16a34a)", fontWeight: 600, fontSize: 14 }}>
        ✓ Recording saved ({formatDuration(doneSegmentSeconds)})
      </span>
      <button
        type="button"
        className="btn"
        style={{ marginLeft: "auto", fontSize: 12 }}
        onClick={onReset}
      >
        Re-record
      </button>
    </div>
  );
}
