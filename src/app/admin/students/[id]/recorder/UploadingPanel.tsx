"use client";

import MicControls, { type MicControlsProps } from "./MicControls";

export type UploadingPanelProps = {
  /**
   * `"segment"` = mid-session save; show MicControls + the smaller "saving
   * segment N" panel because the mic stays hot and the session continues.
   * `"final"` (default) = full Stop & save; show only a single full-width
   * progress bar and no mic controls (the recorder is being torn down).
   */
  mode: "segment" | "final";
  /** Required when mode === "segment" — the controls cluster stays visible. */
  micControls?: MicControlsProps;
  /** 1-based segment index — only used when mode === "segment". */
  segmentNumber?: number;
};

/**
 * Upload-in-progress state. Two flavours:
 *   - `segment` keeps mic controls visible because the recorder will keep
 *     running once the upload returns; the user sees a thin progress bar
 *     under the controls.
 *   - `final` is the full Stop & save upload — no mic controls (we tore the
 *     mic down), just the progress bar.
 */
export default function UploadingPanel({
  mode,
  micControls,
  segmentNumber,
}: UploadingPanelProps) {
  if (mode === "segment") {
    if (!micControls) {
      throw new Error("UploadingPanel mode='segment' requires micControls prop");
    }
    return (
      <div data-testid="audio-record-panel">
        <MicControls {...micControls} />
        <div data-testid="audio-record-uploading-segment" style={{ marginTop: 10 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--color-muted, #6b7280)" }}>
            Saving segment {segmentNumber}… you&apos;ll keep recording in a moment.
          </p>
          <div style={{ height: 6, background: "var(--color-border, #e5e7eb)", borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: "40%",
                background: "var(--color-primary, #2563eb)",
                borderRadius: 3,
                animation: "uploadSweepSeg 1.2s ease-in-out infinite",
              }}
            />
          </div>
          <style>{`@keyframes uploadSweepSeg { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="audio-record-uploading">
      <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--color-muted, #6b7280)" }}>
        Uploading recording…
      </p>
      <div style={{ height: 6, background: "var(--color-border, #e5e7eb)", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: "40%",
            background: "var(--color-primary, #2563eb)",
            borderRadius: 3,
            animation: "uploadSweep 1.2s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`@keyframes uploadSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
    </div>
  );
}
