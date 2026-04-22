"use client";

import AudioPreview from "./AudioPreview";
import type { AudioResult } from "./AudioInputTabs";

export type PendingSegmentListProps = {
  /** All audio segments collected for this generation, in record/upload order. */
  audios: AudioResult[];
  /** Remove a segment by its index in `audios`. */
  onRemove: (index: number) => void;
  /** Disable the per-row remove button while a transcription is in flight. */
  disabled?: boolean;
};

/**
 * The "added segments" stack in AiAssistPanel. Phase 4 of the recorder
 * refactor pulled this out so the parent panel reads top-to-bottom and so
 * this list gets its own jsdom RTL test (covers remove, single-vs-multi
 * label, fallback for previewless segments).
 */
export default function PendingSegmentList({
  audios,
  onRemove,
  disabled,
}: PendingSegmentListProps) {
  if (audios.length === 0) return null;

  return (
    <div style={{ marginBottom: 10 }} data-testid="pending-segment-list">
      {audios.map((audio, i) => (
        <div
          key={audio.blobUrl}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid var(--color-border, #d1d5db)",
            background: "var(--color-surface-subtle, rgba(0,0,0,0.02))",
          }}
        >
          <span
            style={{ fontSize: 12, color: "var(--color-muted, #6b7280)", flexShrink: 0 }}
          >
            Part {i + 1}
            {audios.length > 1 ? ` of ${audios.length}` : ""}
          </span>
          {audio.previewUrl ? (
            <AudioPreview src={audio.previewUrl} mimeType={audio.mimeType} />
          ) : (
            <span style={{ fontSize: 12, flex: 1, color: "var(--color-muted, #6b7280)" }}>
              Saved — no preview
            </span>
          )}
          <button
            type="button"
            aria-label={`Remove segment ${i + 1}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "var(--color-muted, #6b7280)",
              padding: "0 2px",
              flexShrink: 0,
            }}
            onClick={() => onRemove(i)}
            disabled={disabled}
          >
            ×
          </button>
        </div>
      ))}
      <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--color-muted, #6b7280)" }}>
        Add another segment below, or click Transcribe &amp; generate notes.
      </p>
    </div>
  );
}
