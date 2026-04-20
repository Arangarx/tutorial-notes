"use client";

import { useState } from "react";
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

  function switchTab(tab: Tab) {
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

      {activeTab === "upload" && blobEnabled && (
        <AudioUploadInput
          studentId={studentId}
          onUploaded={handleUploaded}
          disabled={disabled}
        />
      )}

      {activeTab === "record" && blobEnabled && (
        <AudioRecordInput
          studentId={studentId}
          onRecorded={handleRecorded}
          onRecordingActive={onRecordingActive}
          disabled={disabled}
        />
      )}
    </div>
  );
}
