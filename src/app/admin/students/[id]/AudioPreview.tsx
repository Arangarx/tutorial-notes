"use client";

import { useEffect, useRef, useState } from "react";

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
 *
 * Phase 4 of the recorder refactor extracted this from AiAssistPanel so it
 * gets its own jsdom test and can be reused by future segment list views.
 */
export type AudioPreviewProps = { src: string; mimeType?: string };

export default function AudioPreview({ src, mimeType }: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasError, setHasError] = useState(false);
  /**
   * Refs (not state) so the values are read synchronously inside event
   * handlers without waiting for a React re-render. Critical for handleError:
   * Chrome can fire `error` immediately after our seek hack, before React has
   * committed the `loadedmetadata` state update — using a state-based flag
   * gives a stale closure and we'd wrongly show the fallback on Chrome.
   */
  const loadedOkRef = useRef(false);
  const needsFixRef = useRef(false);

  const isWebm = mimeType?.toLowerCase().includes("webm") ?? false;

  useEffect(() => {
    loadedOkRef.current = false;
    needsFixRef.current = false;
    setHasError(false);
  }, [src]);

  function handleLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    loadedOkRef.current = true;
    if (!isWebm) return; // MP4 / m4a / mp3 already report correct duration
    if (!Number.isFinite(audio.duration) || audio.duration === 0) {
      needsFixRef.current = true;
      try {
        audio.currentTime = 1e101;
      } catch {
        // Some browsers throw on out-of-range currentTime — harmless, the
        // user can still press play and it will work.
        needsFixRef.current = false;
      }
    }
  }

  function handleDurationChange() {
    const audio = audioRef.current;
    if (!audio || !needsFixRef.current) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore — we just wanted to reset playback position.
      }
      needsFixRef.current = false;
    }
  }

  function handleError() {
    // Newer Chrome versions fire an `error` event when our currentTime=1e101
    // hack seeks out of range, even though the audio loaded fine and plays
    // correctly. If metadata already loaded, the audio is usable — ignore.
    if (loadedOkRef.current) {
      needsFixRef.current = false;
      return;
    }
    setHasError(true);
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
      onError={handleError}
      aria-label="Preview of uploaded or recorded audio"
      style={{ width: "100%", height: 36 }}
      data-testid="audio-preview"
    />
  );
}
