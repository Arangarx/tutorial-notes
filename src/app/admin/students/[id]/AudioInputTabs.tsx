"use client";

import { useCallback, useState } from "react";
import AudioUploadInput, { type UploadedAudio } from "./AudioUploadInput";
import AudioRecordInput, { type RecordedAudio } from "./AudioRecordInput";

type Tab = "text" | "upload" | "record";

export type AudioResult = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
  /** Local object URL for in-browser preview before transcription. */
  previewUrl?: string;
};

type Props = {
  studentId: string;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onAudioReady: (audio: AudioResult, meta?: { keepRecorderMounted?: boolean }) => void;
  onAudioCleared: () => void;
  /** Called when a recording starts/stops so the parent can disable the Transcribe button. */
  onRecordingActive?: (active: boolean) => void;
  disabled?: boolean;
  blobEnabled: boolean;
};

/**
 * Tabbed audio input — Paste text / Upload audio / Record.
 *
 * B3 invariant: AudioRecordInput (and AudioUploadInput) MUST stay mounted
 * once `blobEnabled` is true, regardless of which tab is active. Hiding
 * happens via `display: none` on the wrapper, never via conditional
 * rendering. Pre-B3 the recorder lived behind `{activeTab === "record" && ...}`
 * which silently unmounted the hook → MediaRecorder.stop() in the cleanup
 * effect → tutor lost the in-progress recording with no warning. The
 * regression test for this is __tests__/dom/keep-recorder-mounted.dom.test.tsx.
 *
 * Tab-switch confirms (in this order — first match wins):
 *   1. If a recording is in progress and the user is leaving Record, ask
 *      first. The recorder will keep running in the background, but
 *      tutors deserve a heads-up so they don't think they lost it.
 *   2. If audio has already been finalised (uploaded or recorded), warn
 *      that switching tabs will clear it. This was the pre-B3 behaviour;
 *      kept intact so we don't surprise existing flows.
 */
export default function AudioInputTabs({
  studentId,
  activeTab,
  onTabChange,
  onAudioReady,
  onAudioCleared,
  onRecordingActive,
  disabled,
  blobEnabled,
}: Props) {
  const [hasAudio, setHasAudio] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);

  function handleUploaded(audio: UploadedAudio) {
    setHasAudio(true);
    onAudioReady(audio);
  }

  function handleRecorded(
    audio: RecordedAudio,
    meta?: { autoRollover?: boolean }
  ) {
    setHasAudio(true);
    onAudioReady(audio, { keepRecorderMounted: !!meta?.autoRollover });
  }

  // Wrap the parent's onRecordingActive so we can also track it locally
  // for the tab-switch confirm. useCallback keeps the identity stable so
  // the recorder hook doesn't re-fire its effect on every render.
  const handleRecordingActive = useCallback(
    (active: boolean) => {
      setRecordingActive(active);
      onRecordingActive?.(active);
    },
    [onRecordingActive]
  );

  function switchTab(tab: Tab) {
    if (tab === activeTab) return;

    // Recording-in-progress confirm only fires when leaving the Record
    // tab while a session is live. Going TO record while recording is
    // already on (impossible today, but defensive) just no-ops above.
    if (activeTab === "record" && recordingActive) {
      const confirmed = window.confirm(
        "A recording is in progress. Switching tabs will keep the recorder running in the background — come back to this tab to Stop & save. Switch tabs anyway?"
      );
      if (!confirmed) return;
    }

    if (hasAudio) {
      const confirmed = window.confirm(
        "Switching tabs will discard the current audio. Continue?"
      );
      if (!confirmed) return;
      setHasAudio(false);
      onAudioCleared();
    }

    onTabChange(tab);
  }

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab
      ? "var(--color-primary, #2563eb)"
      : "var(--color-muted, #6b7280)",
    background: "none",
    border: "none",
    borderBottom: activeTab === tab
      ? "2px solid var(--color-primary, #2563eb)"
      : "2px solid transparent",
    cursor: "pointer",
    paddingBottom: 8,
  });

  return (
    <div>
      <div
        role="tablist"
        aria-label="Session input method"
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--color-border, #e5e7eb)",
          marginBottom: 14,
        }}
      >
        <button type="button" role="tab" aria-selected={activeTab === "text"} style={tabStyle("text")} onClick={() => switchTab("text")} data-testid="tab-text">
          Paste text
        </button>
        {blobEnabled && (
          <>
            <button type="button" role="tab" aria-selected={activeTab === "upload"} style={tabStyle("upload")} onClick={() => switchTab("upload")} data-testid="tab-upload">
              Upload audio
            </button>
            <button type="button" role="tab" aria-selected={activeTab === "record"} style={tabStyle("record")} onClick={() => switchTab("record")} data-testid="tab-record">
              Record
            </button>
          </>
        )}
      </div>

      {/* B3 always-mount: both children stay rendered once blobEnabled
          is true. Switching tabs hides them with display:none rather
          than unmounting. Rendering nothing for the Paste tab is fine
          (that input lives in the parent component). */}
      {blobEnabled && (
        <>
          <div
            data-testid="audio-tab-upload-pane"
            style={{ display: activeTab === "upload" ? undefined : "none" }}
          >
            <AudioUploadInput
              studentId={studentId}
              onUploaded={handleUploaded}
              disabled={disabled}
            />
          </div>
          <div
            data-testid="audio-tab-record-pane"
            style={{ display: activeTab === "record" ? undefined : "none" }}
          >
            <AudioRecordInput
              studentId={studentId}
              onRecorded={handleRecorded}
              onRecordingActive={handleRecordingActive}
              disabled={disabled}
            />
          </div>
        </>
      )}
    </div>
  );
}
