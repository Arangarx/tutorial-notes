"use client";

import { useEffect, useRef, useState } from "react";
import { formatUserFacingActionError } from "@/lib/action-correlation";
import { uploadAudioAction } from "./actions";
import { createMicAudioGraph, type MicAudioGraph } from "@/lib/mic-recorder-audio";

/**
 * Pick the best supported MIME type for MediaRecorder in priority order.
 *
 * Priority is webm-first because Chrome / Firefox / Edge produce well-formed
 * WebM that plays back reliably in <audio>. Chrome on Windows DOES report
 * `audio/mp4` as supported in recent versions, but its MP4 output is known to
 * have malformed container metadata (no proper duration, won't seek, often
 * won't play back) — even though Whisper can still decode the raw audio.
 *
 * iOS Safari is the only browser that doesn't support audio/webm, so it falls
 * through to audio/mp4 naturally. The no-timeslice `recorder.start()` call
 * (see startRecording below) keeps iOS MP4 output non-fragmented and playable.
 *
 * If you change this list, manually verify preview playback in BOTH desktop
 * Chrome and iOS Safari — this has regressed twice.
 */
function chooseMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
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

const HARD_CAP_SECONDS = 90 * 60; // 90 minutes
const WARN_AT_SECONDS = 85 * 60;  // 85 minutes

const GAIN_MIN = 0.25;
const GAIN_MAX = 3.0;
const GAIN_DEFAULT = 1.0;
const STORAGE_DEVICE_KEY = "tn-mic-device-id";
const STORAGE_GAIN_KEY = "tn-mic-gain";

export type RecordedAudio = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
  previewUrl?: string;
};

type Props = {
  studentId: string;
  onRecorded: (audio: RecordedAudio) => void;
  /** Called whenever the recording active state changes (requesting/preview/recording/paused/uploading = true). */
  onRecordingActive?: (active: boolean) => void;
  disabled?: boolean;
};

type RecordState =
  | "idle"
  | "requesting"
  | "preview"
  | "recording"
  | "paused"
  | "uploading"
  | "done"
  | "error";

function loadStoredGain(): number {
  if (typeof window === "undefined") return GAIN_DEFAULT;
  const raw = window.localStorage.getItem(STORAGE_GAIN_KEY);
  if (!raw) return GAIN_DEFAULT;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < GAIN_MIN || n > GAIN_MAX) return GAIN_DEFAULT;
  return n;
}

function loadStoredDeviceId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_DEVICE_KEY) ?? "";
}

/** Decide bar colour by level — green/yellow/red zones for visible feedback. */
function meterColor(level: number): string {
  if (level >= 0.85) return "var(--color-error, #dc2626)";
  if (level >= 0.5) return "#eab308"; // amber-500
  if (level >= 0.05) return "var(--color-success, #16a34a)";
  return "var(--color-muted, #9ca3af)";
}

export default function AudioRecordInput({ studentId, onRecorded, onRecordingActive, disabled }: Props) {
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Mic setup state
  /** Audio input devices we can show in the picker — populated after permission grant. */
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  /** Currently selected deviceId (empty string = browser default). */
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  /** Label of the actual track in use (may differ from selected if "default" was used). */
  const [activeDeviceLabel, setActiveDeviceLabel] = useState<string>("");
  /** Digital gain applied in the browser before MediaRecorder. NOT a substitute for OS mic level. */
  const [gainLinear, setGainLinear] = useState<number>(GAIN_DEFAULT);
  /** Smoothed RMS 0..1 for the level meter. */
  const [meterLevel, setMeterLevel] = useState<number>(0);
  /** True when we have a Web Audio graph running (meter visible, slider effective). */
  const [graphActive, setGraphActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const graphRef = useRef<MicAudioGraph | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const ACTIVE_STATES: RecordState[] = ["requesting", "preview", "recording", "paused", "uploading"];

  // Load persisted prefs after mount (avoid SSR/hydration mismatch).
  useEffect(() => {
    setGainLinear(loadStoredGain());
    setSelectedDeviceId(loadStoredDeviceId());
  }, []);

  // Notify parent whenever the active state changes.
  useEffect(() => {
    onRecordingActive?.(ACTIVE_STATES.includes(recordState));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordState]);

  // Live gain updates while graph is active; persist value.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_GAIN_KEY, String(gainLinear));
    }
    graphRef.current?.setGain(gainLinear);
  }, [gainLinear]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopTimer();
      teardownMicStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopMeter() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setMeterLevel(0);
  }

  function teardownMicStream() {
    stopMeter();
    // Graph dispose stops mic tracks AND closes audio context.
    graphRef.current?.dispose();
    graphRef.current = null;
    // Belt-and-suspenders: stop any remaining tracks (raw-stream fallback path).
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    setGraphActive(false);
  }

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

  function startMeter(graph: MicAudioGraph) {
    stopMeter();
    const tick = () => {
      setMeterLevel(graph.getLevel());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  /**
   * Acquire the mic with optional device constraint, populate the device list
   * (labels become available once permission is granted), build the audio graph,
   * and start the level meter. If `forRecording`, also starts MediaRecorder.
   */
  async function acquireMic(opts: { deviceId?: string; forRecording: boolean }) {
    setError(null);
    teardownMicStream();
    setRecordState("requesting");

    let stream: MediaStream;
    try {
      const constraints: MediaStreamConstraints = {
        audio: opts.deviceId ? { deviceId: { exact: opts.deviceId } } : true,
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const name = err instanceof Error ? (err as DOMException).name : "";
      console.error("[AudioRecordInput] getUserMedia failed:", err);
      let msg: string;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        msg =
          "Microphone access denied. Click the icon at the left of the address bar (looks like a slider or tune icon), set Microphone to Allow, then reload the page and try again.";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        msg = "No microphone found. Please connect a microphone and try again.";
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        msg =
          "Microphone is in use by another app (e.g. Discord, Teams). Close that app or switch its audio device, then try again.";
      } else if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
        if (opts.deviceId) {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(STORAGE_DEVICE_KEY);
          }
          setSelectedDeviceId("");
          msg =
            "The previously selected microphone is no longer available. Tap Test microphone again to pick a different one.";
        } else {
          msg = "Microphone constraints not satisfied. Try choosing a different device.";
        }
      } else {
        msg = `Microphone error (${name || "unknown"}). Try reloading the page. If the problem persists, use the Upload tab instead.`;
      }
      setError(msg);
      setRecordState("error");
      return;
    }

    streamRef.current = stream;
    const audioTrack = stream.getAudioTracks?.()[0];
    setActiveDeviceLabel(audioTrack?.label?.trim() ?? "");

    // Persist the actual deviceId in use (browsers sometimes resolve "default" to a real id).
    const settings = audioTrack?.getSettings?.();
    if (settings?.deviceId && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_DEVICE_KEY, settings.deviceId);
      setSelectedDeviceId(settings.deviceId);
    }

    // Enumerate AFTER permission so labels populate (browsers redact labels otherwise).
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === "audioinput");
      setDevices(inputs);
    } catch (err) {
      console.warn("[AudioRecordInput] enumerateDevices failed:", err);
    }

    // Build the audio graph (gain + meter). Returns null if Web Audio is unavailable
    // or the stream isn't a real MediaStream (test stub) — fall back to raw stream below.
    const graph = await createMicAudioGraph(stream, gainLinear);
    graphRef.current = graph;

    if (graph) {
      setGraphActive(true);
      startMeter(graph);
    }

    if (opts.forRecording) {
      startMediaRecorder();
    } else {
      setRecordState("preview");
    }
  }

  function startMediaRecorder() {
    const stream = streamRef.current;
    if (!stream) {
      setError("No microphone stream available.");
      setRecordState("error");
      return;
    }

    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);

    const mimeType = chooseMimeType();
    // Prefer the processed (gain-adjusted) stream; fall back to raw for browsers / tests
    // where Web Audio isn't available.
    const recordingStream = graphRef.current?.recordingStream ?? stream;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
    } catch {
      setError("Your browser doesn't support audio recording. Please upload a file instead.");
      teardownMicStream();
      setRecordState("error");
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    // IMPORTANT: do NOT pass a timeslice argument to start(). Chunked output
    // (start(1000)) makes iOS Safari emit fragmented MP4 pieces that don't
    // concatenate into a playable / Whisper-decodable file.
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecordState("recording");
    startTimer();
  }

  async function handleTestMic() {
    await acquireMic({ deviceId: selectedDeviceId || undefined, forRecording: false });
  }

  async function handleStartRecording() {
    if ((recordState === "preview") && streamRef.current) {
      // Mic already running from preview — go straight to recording, reusing graph.
      startMediaRecorder();
    } else {
      await acquireMic({ deviceId: selectedDeviceId || undefined, forRecording: true });
    }
  }

  async function handleDeviceChange(newDeviceId: string) {
    setSelectedDeviceId(newDeviceId);
    if (typeof window !== "undefined") {
      if (newDeviceId) window.localStorage.setItem(STORAGE_DEVICE_KEY, newDeviceId);
      else window.localStorage.removeItem(STORAGE_DEVICE_KEY);
    }
    // Re-acquire only when previewing (we disable the picker mid-recording).
    if (recordState === "preview") {
      await acquireMic({ deviceId: newDeviceId || undefined, forRecording: false });
    }
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
    if (elapsedRef.current > 0 && elapsedRef.current < 8) {
      const ok = window.confirm(
        "This clip is very short. Speech recognition often fails or invents text when there isn’t enough speech. Record at least 10–15 seconds, or stop anyway if you meant to."
      );
      if (!ok) return;
    }

    stopTimer();
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || chooseMimeType();
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];

      // Tear down the mic stream + graph now that we have all the bytes.
      teardownMicStream();

      if (blob.size === 0) {
        setError("Recording appears empty. Please try again.");
        setRecordState("error");
        return;
      }

      const ext = fileExtension(mimeType);
      const filename = `session-${Date.now()}.${ext}`;
      setRecordState("uploading");

      try {
        const runUpload = () => {
          const fd = new FormData();
          fd.append("file", new File([blob], filename, { type: mimeType }));
          return uploadAudioAction(studentId, fd);
        };

        let result = await runUpload();
        if (!result.ok) {
          result = await runUpload();
        }

        if (!result.ok) {
          setError(formatUserFacingActionError(result.error, result.debugId));
          setRecordState("error");
          return;
        }

        setRecordState("done");
        const previewUrl = URL.createObjectURL(blob);
        onRecorded({
          blobUrl: result.blobUrl,
          mimeType,
          sizeBytes: blob.size,
          filename,
          previewUrl,
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
    teardownMicStream();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);
    setError(null);
    setActiveDeviceLabel("");
    setRecordState("idle");
  }

  function handleStopPreview() {
    teardownMicStream();
    setActiveDeviceLabel("");
    setRecordState("idle");
  }

  const isWarning = elapsed >= WARN_AT_SECONDS;

  // ---------- Reusable mic-control panel (picker + slider + meter) -----------
  // Shown in `preview`, `recording`, and `paused` states. Device picker is locked
  // during recording/paused; gain slider stays live so tutors can fix levels mid-session.
  function MicControls({ lockDevice }: { lockDevice: boolean }) {
    return (
      <div
        data-testid="mic-controls"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "10px 12px",
          marginBottom: 12,
          background: "var(--color-bg-subtle, #f9fafb)",
          border: "1px solid var(--color-border, #e5e7eb)",
          borderRadius: 6,
        }}
      >
        {/* Device picker */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ minWidth: 56, color: "var(--color-muted, #6b7280)" }}>Mic:</span>
          <select
            data-testid="mic-device-select"
            value={selectedDeviceId}
            disabled={lockDevice || devices.length === 0}
            onChange={(e) => handleDeviceChange(e.target.value)}
            style={{
              flex: 1,
              padding: "4px 8px",
              fontSize: 13,
              border: "1px solid var(--color-border, #d1d5db)",
              borderRadius: 4,
              background: "var(--color-bg, #fff)",
            }}
          >
            {devices.length === 0 && (
              <option value="">{activeDeviceLabel || "(default microphone)"}</option>
            )}
            {devices.map((d, i) => (
              <option key={d.deviceId || `default-${i}`} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </select>
        </label>

        {/* Gain slider */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ minWidth: 56, color: "var(--color-muted, #6b7280)" }}>Boost:</span>
          <input
            data-testid="mic-gain-slider"
            type="range"
            min={GAIN_MIN}
            max={GAIN_MAX}
            step={0.05}
            value={gainLinear}
            onChange={(e) => setGainLinear(parseFloat(e.target.value))}
            disabled={!graphActive}
            style={{ flex: 1 }}
            aria-label="Microphone boost"
          />
          <span
            style={{
              minWidth: 44,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              fontSize: 12,
              color: "var(--color-muted, #6b7280)",
            }}
          >
            {gainLinear.toFixed(2)}×
          </span>
        </label>

        {/* Level meter */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ minWidth: 56, fontSize: 13, color: "var(--color-muted, #6b7280)" }}>
            Level:
          </span>
          <div
            data-testid="mic-level-meter"
            aria-label="Microphone input level"
            role="meter"
            aria-valuenow={Math.round(meterLevel * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              flex: 1,
              height: 10,
              background: "var(--color-border, #e5e7eb)",
              borderRadius: 5,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                width: `${Math.round(meterLevel * 100)}%`,
                height: "100%",
                background: meterColor(meterLevel),
                transition: "width 80ms linear, background 200ms linear",
              }}
            />
          </div>
        </div>

        {!graphActive && (
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-muted, #9ca3af)", lineHeight: 1.35 }}>
            Live level meter not available in this browser. Recording will still work.
          </p>
        )}

        <p style={{ margin: 0, fontSize: 11, color: "var(--color-muted, #9ca3af)", lineHeight: 1.35 }}>
          Speak normally — aim for the bar to land in the green when talking. If it stays grey, raise
          your <strong>OS microphone level</strong> too (the boost slider only amplifies in the browser).
        </p>
      </div>
    );
  }

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
            Record up to 90 minutes. Speak clearly for at least <strong>15 seconds</strong> — very short clips often fail. Use Pause for off-topic breaks.
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--color-muted, #6b7280)", lineHeight: 1.4 }}>
            Tap <strong>Test microphone</strong> first to pick the right input and verify your voice is being heard. If the browser never asks for the microphone, use the site menu (lock or sliders icon in the address bar) and set Microphone to <strong>Allow</strong>, then reload.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              onClick={handleTestMic}
              disabled={disabled}
              data-testid="audio-record-test-mic"
            >
              Test microphone
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleStartRecording}
              disabled={disabled}
              aria-label="Start recording"
              data-testid="audio-record-start"
            >
              ● Start recording
            </button>
          </div>
        </div>
      )}

      {recordState === "requesting" && (
        <p role="status" style={{ fontSize: 14, color: "var(--color-muted, #6b7280)", textAlign: "center" }}>
          Waiting for microphone permission…
        </p>
      )}

      {recordState === "preview" && (
        <div data-testid="audio-record-preview">
          <MicControls lockDevice={false} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="btn primary"
              onClick={handleStartRecording}
              disabled={disabled}
              aria-label="Start recording"
              data-testid="audio-record-start"
            >
              ● Start recording
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleStopPreview}
              aria-label="Stop preview"
              data-testid="audio-record-stop-preview"
            >
              Cancel
            </button>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
              Speak — watch the level bar.
            </span>
          </div>
        </div>
      )}

      {(recordState === "recording" || recordState === "paused") && (
        <div data-testid="audio-record-controls">
          <MicControls lockDevice={true} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span
              aria-hidden="true"
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
              aria-live="polite"
              aria-label={`Recording duration: ${formatDuration(elapsed)}`}
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
              <span role="alert" style={{ fontSize: 12, color: "var(--color-error, #dc2626)" }}>
                5 min remaining — will auto-stop at 90 min
              </span>
            )}
            <span aria-live="polite" style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
              {recordState === "paused" ? "Paused" : "Recording…"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {recordState === "recording" ? (
              <button
                type="button"
                className="btn"
                onClick={pauseRecording}
                aria-label="Pause recording"
                data-testid="audio-record-pause"
              >
                ⏸ Pause
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={resumeRecording}
                aria-label="Resume recording"
                data-testid="audio-record-resume"
              >
                ▶ Resume
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={stopAndUpload}
              aria-label="Stop and save recording"
              data-testid="audio-record-stop"
            >
              ■ Stop & save
            </button>
            <button
              type="button"
              className="btn"
              style={{ marginLeft: "auto" }}
              onClick={handleReset}
              aria-label="Discard recording"
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
              role="alert"
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
