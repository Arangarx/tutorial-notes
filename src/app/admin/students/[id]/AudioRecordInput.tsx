"use client";

import { useEffect, useRef, useState } from "react";
import { uploadAudioAction } from "./actions";

/**
 * Pick the best supported MIME type for MediaRecorder in priority order.
 * audio/mp4 preferred (iOS Safari + Chrome); fallback to audio/webm (most desktop).
 */
function chooseMimeType(): string {
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

function fileExtension(mimeType: string): string {
  if (mimeType.startsWith("audio/mp4")) return "mp4";
  if (mimeType.startsWith("audio/ogg")) return "ogg";
  return "webm";
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const HARD_CAP_SECONDS = 60 * 60; // 60 minutes
const WARN_AT_SECONDS = 55 * 60;  // 55 minutes

export type RecordedAudio = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
};

type Props = {
  studentId: string;
  onRecorded: (audio: RecordedAudio) => void;
  disabled?: boolean;
};

type RecordState = "idle" | "requesting" | "recording" | "paused" | "uploading" | "done" | "error";

export default function AudioRecordInput({ studentId, onRecorded, disabled }: Props) {
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTimer() {
    stopTimer();
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);

      if (elapsedRef.current >= HARD_CAP_SECONDS) {
        stopAndUpload();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    setRecordState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof Error ? (err as DOMException).name : "";
      console.error("[AudioRecordInput] getUserMedia failed:", err);
      let msg: string;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        msg = "Microphone access denied. Click the lock icon in your browser's address bar, set Microphone to Allow, then reload the page and try again.";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        msg = "No microphone found. Please connect a microphone and try again.";
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        msg = "Microphone is in use by another app (e.g. Discord, Teams). Close that app or switch its audio device, then try again.";
      } else {
        msg = `Microphone error (${name || "unknown"}). Try reloading the page. If the problem persists, use the Upload tab instead.`;
      }
      setError(msg);
      setRecordState("error");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);

    const mimeType = chooseMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      setError("Your browser doesn't support audio recording. Please upload a file instead.");
      stream.getTracks().forEach((t) => t.stop());
      setRecordState("error");
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.start(1000); // collect chunks every second
    mediaRecorderRef.current = recorder;
    setRecordState("recording");
    startTimer();
  }

  function pauseRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      stopTimer();
      setRecordState("paused");
    }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      startTimer();
      setRecordState("recording");
    }
  }

  function stopAndUpload() {
    stopTimer();
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const mimeType = recorder.mimeType || chooseMimeType();
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];

      if (blob.size === 0) {
        setError("Recording appears empty. Please try again.");
        setRecordState("error");
        return;
      }

      const ext = fileExtension(mimeType);
      const filename = `session-${Date.now()}.${ext}`;
      setRecordState("uploading");

      try {
        const formData = new FormData();
        formData.append("file", new File([blob], filename, { type: mimeType }));
        const result = await uploadAudioAction(studentId, formData);

        if (!result.ok) {
          setError(result.error);
          setRecordState("error");
          return;
        }

        setRecordState("done");
        onRecorded({
          blobUrl: result.blobUrl,
          mimeType,
          sizeBytes: blob.size,
          filename,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setError(msg);
        setRecordState("error");
      }
    };

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function handleReset() {
    stopTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);
    setError(null);
    setRecordState("idle");
  }

  const isWarning = elapsed >= WARN_AT_SECONDS;

  if (recordState === "done") {
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
          ✓ Recording saved ({formatDuration(elapsed)})
        </span>
        <button
          type="button"
          className="btn"
          style={{ marginLeft: "auto", fontSize: 12 }}
          onClick={handleReset}
        >
          Re-record
        </button>
      </div>
    );
  }

  if (recordState === "uploading") {
    return (
      <div data-testid="audio-record-uploading">
        <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--color-muted, #6b7280)" }}>
          Uploading recording…
        </p>
        <div style={{ height: 6, background: "var(--color-border, #e5e7eb)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: "40%",
            background: "var(--color-primary, #2563eb)",
            borderRadius: 3,
            animation: "uploadSweep 1.2s ease-in-out infinite",
          }} />
        </div>
        <style>{`@keyframes uploadSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
      </div>
    );
  }

  return (
    <div data-testid="audio-record-panel">
      {recordState === "idle" && (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-muted, #6b7280)" }}>
            Record up to 60 minutes. Use Pause for off-topic breaks.
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={startRecording}
            disabled={disabled}
            data-testid="audio-record-start"
          >
            ● Start recording
          </button>
        </div>
      )}

      {recordState === "requesting" && (
        <p style={{ fontSize: 14, color: "var(--color-muted, #6b7280)", textAlign: "center" }}>
          Waiting for microphone permission…
        </p>
      )}

      {(recordState === "recording" || recordState === "paused") && (
        <div data-testid="audio-record-controls">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: recordState === "recording"
                  ? "var(--color-error, #dc2626)"
                  : "var(--color-muted, #9ca3af)",
                animation: recordState === "recording" ? "pulse 1s infinite" : undefined,
              }}
            />
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                fontSize: 18,
                color: isWarning ? "var(--color-error, #dc2626)" : undefined,
              }}
            >
              {formatDuration(elapsed)}
            </span>
            {isWarning && (
              <span style={{ fontSize: 12, color: "var(--color-error, #dc2626)" }}>
                5 min remaining — will auto-stop at 60 min
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
              {recordState === "paused" ? "Paused" : "Recording…"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {recordState === "recording" ? (
              <button
                type="button"
                className="btn"
                onClick={pauseRecording}
                data-testid="audio-record-pause"
              >
                ⏸ Pause
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={resumeRecording}
                data-testid="audio-record-resume"
              >
                ▶ Resume
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={stopAndUpload}
              data-testid="audio-record-stop"
            >
              ■ Stop & save
            </button>
            <button
              type="button"
              className="btn"
              style={{ marginLeft: "auto", color: "var(--color-muted, #6b7280)" }}
              onClick={handleReset}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {(recordState === "error") && (
        <>
          {error && (
            <p
              style={{ fontSize: 13, color: "var(--color-error, #dc2626)", margin: "0 0 10px" }}
              data-testid="audio-record-error"
            >
              {error}
            </p>
          )}
          <button type="button" className="btn" onClick={handleReset}>
            Try again
          </button>
        </>
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
