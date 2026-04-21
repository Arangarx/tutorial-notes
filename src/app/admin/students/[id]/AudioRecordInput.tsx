"use client";

import { useEffect, useRef, useState } from "react";
import { formatUserFacingActionError } from "@/lib/action-correlation";
import { uploadAudioAction } from "./actions";
import { createMicAudioGraph, type MicAudioGraph } from "@/lib/mic-recorder-audio";
import { chooseMimeType, fileExtension } from "@/lib/recording/mime";
import {
  SEGMENT_MAX_SECONDS,
  WARN_SEGMENT_SECONDS,
  SESSION_SAFETY_MAX_SECONDS,
  formatSegmentTimeLeft,
} from "@/lib/recording/segment-policy";
import {
  playApproachingMaxTimeChime,
  playSegmentRolloverChime,
} from "@/lib/recording/chimes";
import {
  GAIN_DEFAULT,
  GAIN_MAX,
  GAIN_MIN,
  CHIME_VOL_DEFAULT,
  CHIME_VOL_MAX,
  CHIME_VOL_MIN,
  loadStoredChimeEnabled,
  loadStoredChimeVolume,
  loadStoredDeviceId,
  loadStoredGain,
  saveStoredChimeEnabled,
  saveStoredChimeVolume,
  saveStoredDeviceId,
  saveStoredGain,
} from "@/lib/recording/storage";
import { queryMicPermission } from "@/lib/recording/permissions";
import { uploadAudioWithRetry } from "@/lib/recording/upload";
import {
  ACTIVE_STATES,
  type RecordState,
} from "@/lib/recording/recording-state";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type RecordedAudio = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
  previewUrl?: string;
};

type Props = {
  studentId: string;
  /** `autoRollover` when a segment was auto-saved mid-session; parent should append without remounting the recorder. */
  onRecorded: (audio: RecordedAudio, meta?: { autoRollover?: boolean }) => void;
  /** Called whenever the recording active state changes (acquiring/ready/recording/paused/uploading = true). */
  onRecordingActive?: (active: boolean) => void;
  disabled?: boolean;
};

/** Decide bar colour by level — green/yellow/red zones for visible feedback. */
function meterColor(level: number): string {
  if (level >= 0.85) return "var(--color-error, #dc2626)";
  if (level >= 0.5) return "#eab308"; // amber-500
  if (level >= 0.05) return "var(--color-success, #16a34a)";
  return "var(--color-muted, #9ca3af)";
}

// =====================================================================
// MicControls — hoisted to module scope so its identity is stable across
// parent re-renders. If this is defined inside the parent function, every
// parent render creates a NEW component type, React unmounts/remounts the
// subtree, and the slider drag is killed mid-gesture.
// =====================================================================

type MicControlsProps = {
  /** Reference to the meter fill <div> so we can update its width/colour without re-rendering. */
  meterBarRef: React.RefObject<HTMLDivElement | null>;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
  gainLinear: number;
  onGainChange: (gain: number) => void;
  /** True when mic is hot (graph running) — controls are enabled, meter is live. */
  isLive: boolean;
  /** True during recording/paused — picker is locked but slider stays live. */
  lockDevice: boolean;
  /** Optional message shown when mic isn't yet acquired. */
  hint?: string;
  /** Play a short sound (and vibrate on mobile) when approaching max recording length. */
  chimeEnabled: boolean;
  onChimeEnabledChange: (enabled: boolean) => void;
  /** 0.05–1 — alert loudness when chime is on. */
  chimeVolume: number;
  onChimeVolumeChange: (volume: number) => void;
};

function MicControls({
  meterBarRef,
  devices,
  selectedDeviceId,
  onDeviceChange,
  gainLinear,
  onGainChange,
  isLive,
  lockDevice,
  hint,
  chimeEnabled,
  onChimeEnabledChange,
  chimeVolume,
  onChimeVolumeChange,
}: MicControlsProps) {
  const pickerDisabled = lockDevice || (!isLive && devices.length === 0);
  const sliderDisabled = !isLive;
  // Visual percentage of the gain slider — used to drive the custom track fill
  // (so the filled portion grows from 0% at min to 100% at max with the thumb).
  const gainPct = ((gainLinear - GAIN_MIN) / (GAIN_MAX - GAIN_MIN)) * 100;
  const chimeVolPct =
    ((chimeVolume - CHIME_VOL_MIN) / (CHIME_VOL_MAX - CHIME_VOL_MIN)) * 100;

  return (
    <div
      data-testid="mic-controls"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 14px",
        marginBottom: 12,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      {/* Device picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            minWidth: 92,
            fontSize: 13,
            color: "var(--muted)",
            fontWeight: 500,
          }}
        >
          Mic:
        </span>
        <select
          data-testid="mic-device-select"
          aria-label="Microphone device"
          value={selectedDeviceId}
          disabled={pickerDisabled}
          onChange={(e) => onDeviceChange(e.target.value)}
          title={
            devices.find((d) => d.deviceId === selectedDeviceId)?.label || undefined
          }
          style={{
            flex: 1,
            // `min-width: 0` lets a flex item shrink below its content size —
            // without this, a long device name (e.g. "Microphone (Brio 101)
            // (046d:094d)") forces the select wider than its slot and overflows
            // the panel. The `max-width: 100%` is belt-and-suspenders for older
            // engines that don't honour min-width: 0 on selects.
            minWidth: 0,
            maxWidth: "100%",
            width: "auto", // override globals.css `select { width: 100% }`
            padding: "6px 10px",
            fontSize: 13,
            margin: 0,
            borderRadius: 6,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {devices.length === 0 ? (
            <option value="">
              {isLive ? "(default microphone)" : "(allow mic access to choose)"}
            </option>
          ) : (
            devices.map((d, i) => (
              <option key={d.deviceId || `default-${i}`} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Gain slider */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            minWidth: 92,
            fontSize: 13,
            color: "var(--muted)",
            fontWeight: 500,
          }}
        >
          Browser boost:
        </span>
        <input
          data-testid="mic-gain-slider"
          className="mic-gain-slider"
          type="range"
          min={GAIN_MIN}
          max={GAIN_MAX}
          step={0.05}
          value={gainLinear}
          onChange={(e) => onGainChange(parseFloat(e.target.value))}
          disabled={sliderDisabled}
          aria-label="Browser boost"
          /* CSS variable consumed by .mic-gain-slider rule below to fill the
             track from 0 → gainPct% with the accent colour. */
          style={{ ["--gain-pct" as string]: `${gainPct}%` } as React.CSSProperties}
        />
        <span
          style={{
            minWidth: 48,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          {gainLinear.toFixed(2)}×
        </span>
      </div>

      {/* Level meter */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            minWidth: 92,
            fontSize: 13,
            color: "var(--muted)",
            fontWeight: 500,
          }}
        >
          Level:
        </span>
        <div
          data-testid="mic-level-meter"
          aria-label="Microphone input level"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            flex: 1,
            height: 10,
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Updated imperatively via meterBarRef in the rAF loop — never via
              React state — so the meter doesn't re-render the slider 60×/sec
              and break drag. */}
          <div
            ref={meterBarRef}
            style={{
              width: "0%",
              height: "100%",
              background: meterColor(0),
              transition: "width 80ms linear, background 200ms linear",
            }}
          />
        </div>
      </div>

      {/* Approaching max time — sound + volume (this recorder only; persisted locally). */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          rowGap: 8,
          paddingTop: 4,
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--muted)",
            fontWeight: 500,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={chimeEnabled}
            onChange={(e) => onChimeEnabledChange(e.target.checked)}
            data-testid="recording-chime-enabled"
            aria-label="Sound alert when approaching max recording length"
          />
          Time alert sound
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 160px", minWidth: 0 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>Volume:</span>
          <input
            type="range"
            className="mic-chime-slider"
            min={CHIME_VOL_MIN}
            max={CHIME_VOL_MAX}
            step={0.05}
            value={chimeVolume}
            onChange={(e) => onChimeVolumeChange(parseFloat(e.target.value))}
            disabled={!chimeEnabled}
            aria-label="Time alert volume"
            data-testid="recording-chime-volume"
            style={{ ["--chime-pct" as string]: `${chimeVolPct}%` } as React.CSSProperties}
          />
        </div>
      </div>

      {hint && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
          {hint}
        </p>
      )}

      <p style={{ margin: 0, fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
        Speak normally — aim for the bar to land in the green when talking. The browser cannot change
        your <strong>Windows / system mic level</strong>; if the bar stays grey even at 3.00× boost,
        open <em>Settings → System → Sound → Input</em> and raise the level there (or pick a different
        mic in the dropdown above).
      </p>

      {/* Custom slider styling — without `appearance: none` the native control
          renders as a giant browser-default bar in Chrome on Windows dark mode.
          We render a thin track filled to `--gain-pct` with the accent colour
          and a small circular thumb that visually centres at the value. */}
      <style>{`
        .mic-gain-slider {
          flex: 1;
          width: 100%;
          height: 18px;
          margin: 0;
          padding: 0;
          background: transparent;
          border: none;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
        }
        .mic-gain-slider:disabled { cursor: not-allowed; opacity: 0.5; }
        .mic-gain-slider:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 4px;
          border-radius: 4px;
        }
        .mic-gain-slider::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(
            to right,
            var(--accent) 0%,
            var(--accent) var(--gain-pct, 0%),
            rgba(255, 255, 255, 0.15) var(--gain-pct, 0%),
            rgba(255, 255, 255, 0.15) 100%
          );
        }
        .mic-gain-slider::-moz-range-track {
          height: 4px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.15);
        }
        .mic-gain-slider::-moz-range-progress {
          height: 4px;
          border-radius: 2px;
          background: var(--accent);
        }
        .mic-gain-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          margin-top: -5px; /* centre the 14px thumb on the 4px track */
          border-radius: 50%;
          background: #fff;
          border: 2px solid var(--accent);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .mic-gain-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid var(--accent);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .mic-chime-slider {
          flex: 1;
          width: 100%;
          min-width: 0;
          height: 18px;
          margin: 0;
          padding: 0;
          background: transparent;
          border: none;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
        }
        .mic-chime-slider:disabled { cursor: not-allowed; opacity: 0.45; }
        .mic-chime-slider::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(
            to right,
            var(--accent) 0%,
            var(--accent) var(--chime-pct, 0%),
            rgba(255, 255, 255, 0.15) var(--chime-pct, 0%),
            rgba(255, 255, 255, 0.15) 100%
          );
        }
        .mic-chime-slider::-moz-range-track {
          height: 4px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.15);
        }
        .mic-chime-slider::-moz-range-progress {
          height: 4px;
          border-radius: 2px;
          background: var(--accent);
        }
        .mic-chime-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          margin-top: -4px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid var(--accent);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .mic-chime-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid var(--accent);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// AudioRecordInput
// =====================================================================

export default function AudioRecordInput({ studentId, onRecorded, onRecordingActive, disabled }: Props) {
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /** Audio input devices populated after permission grant. */
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  /** Currently selected deviceId (empty string = browser default). */
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  /** Digital gain applied in the browser before MediaRecorder. NOT a substitute for OS mic level. */
  const [gainLinear, setGainLinear] = useState<number>(GAIN_DEFAULT);
  /** Local-only: approaching-max time chime (sound + optional vibration on phones). */
  const [chimeEnabled, setChimeEnabled] = useState(() => loadStoredChimeEnabled());
  const [chimeVolume, setChimeVolume] = useState(() => loadStoredChimeVolume());
  /** Current segment index (1-based) — increments on auto-rollover. */
  const [segmentNumber, setSegmentNumber] = useState(1);
  /** `segment` = saving mid-session without tearing down the mic; `final` = full-screen upload. */
  const [uploadMode, setUploadMode] = useState<null | "segment" | "final">(null);
  /** Duration shown on the success card after Stop & save (last segment only). */
  const [doneSegmentSeconds, setDoneSegmentSeconds] = useState(0);
  /** Last-known mic permission state, used only to pick the right hint copy. */
  const [permissionState, setPermissionState] = useState<"granted" | "prompt" | "denied" | "unknown">("unknown");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const graphRef = useRef<MicAudioGraph | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const meterBarRef = useRef<HTMLDivElement | null>(null);
  /** Tracks the latest meter colour so we don't thrash style.background every frame. */
  const meterColorRef = useRef<string>(meterColor(0));
  /** One audible "approaching max time" cue per recording (not on pause/resume timer restarts). */
  const approachingCapSoundPlayedRef = useRef(false);
  /** Wall-clock session length across auto-rollovers (for safety cap). */
  const totalSessionElapsedRef = useRef(0);
  /** Prevents double-firing auto-rollover from the 1s timer. */
  const rolloverInProgressRef = useRef(false);
  const chimeEnabledRef = useRef(chimeEnabled);
  const chimeVolumeRef = useRef(chimeVolume);

  useEffect(() => {
    chimeEnabledRef.current = chimeEnabled;
  }, [chimeEnabled]);
  useEffect(() => {
    chimeVolumeRef.current = chimeVolume;
  }, [chimeVolume]);

  // Load persisted prefs after mount (avoid SSR/hydration mismatch).
  useEffect(() => {
    setGainLinear(loadStoredGain());
    setSelectedDeviceId(loadStoredDeviceId());
  }, []);

  useEffect(() => {
    saveStoredChimeEnabled(chimeEnabled);
  }, [chimeEnabled]);

  useEffect(() => {
    saveStoredChimeVolume(chimeVolume);
  }, [chimeVolume]);

  // Notify parent whenever the active state changes.
  useEffect(() => {
    onRecordingActive?.(ACTIVE_STATES.includes(recordState));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordState]);

  // Live gain updates while graph is active; persist value.
  useEffect(() => {
    saveStoredGain(gainLinear);
    graphRef.current?.setGain(gainLinear);
  }, [gainLinear]);

  // Acquire mic on mount unless permission is already denied. The user opened
  // the Record tab — that's a clear intent signal, the same as opening Google
  // Meet's join page. We let the browser show its prompt if needed (state =
  // "prompt" or "unknown"). On "denied" we stay idle so we don't fire a
  // getUserMedia call that we know will reject and pollute the console.
  //
  // StrictMode-safe: in dev React mounts effects twice. We use a per-effect
  // `cancelled` flag (the first run bails after its cleanup fires) plus a
  // `streamRef.current` short-circuit (the second run won't double-acquire if
  // the first already succeeded). No module/instance-level "already attempted"
  // ref — that pattern blocks the legitimate post-remount auto-acquire after
  // the parent re-keys this component on save.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = await queryMicPermission();
      if (cancelled) return;
      setPermissionState(permission);
      if (permission === "denied") return;
      if (streamRef.current) return; // already acquired (e.g. StrictMode race)
      await acquireMic({
        deviceId: loadStoredDeviceId() || undefined,
        forRecording: false,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Reset the bar to empty/grey via the ref (no re-render).
    if (meterBarRef.current) {
      meterBarRef.current.style.width = "0%";
      meterBarRef.current.style.background = meterColor(0);
    }
    meterColorRef.current = meterColor(0);
  }

  function teardownMicStream() {
    stopMeter();
    graphRef.current?.dispose();
    graphRef.current = null;
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
  }

  function startTimer() {
    stopTimer();
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      totalSessionElapsedRef.current += 1;
      setElapsed(elapsedRef.current);

      if (
        elapsedRef.current >= WARN_SEGMENT_SECONDS &&
        !approachingCapSoundPlayedRef.current
      ) {
        approachingCapSoundPlayedRef.current = true;
        const vol = chimeEnabledRef.current ? chimeVolumeRef.current : 0;
        playApproachingMaxTimeChime(vol);
      }

      // Safety valve: very long continuous sessions (timer pauses when recording is paused).
      if (
        totalSessionElapsedRef.current >= SESSION_SAFETY_MAX_SECONDS &&
        !rolloverInProgressRef.current
      ) {
        rolloverInProgressRef.current = true;
        stopAndUpload("final");
        return;
      }

      if (
        elapsedRef.current >= SEGMENT_MAX_SECONDS &&
        !rolloverInProgressRef.current
      ) {
        rolloverInProgressRef.current = true;
        const vol = chimeEnabledRef.current ? chimeVolumeRef.current : 0;
        playSegmentRolloverChime(vol);
        stopAndUpload("rollover");
      }
    }, 1000);
  }

  /**
   * Drive the meter bar via DOM ref — never via setState. A meter that ticks
   * 60 times/sec via state would re-render the entire panel every frame; the
   * slider's drag gesture would get cancelled by the unmount, and CPU usage
   * would be embarrassing.
   */
  function startMeter(graph: MicAudioGraph) {
    stopMeter();
    const tick = () => {
      const level = graph.getLevel();
      const bar = meterBarRef.current;
      if (bar) {
        bar.style.width = `${Math.round(level * 100)}%`;
        const next = meterColor(level);
        if (next !== meterColorRef.current) {
          bar.style.background = next;
          meterColorRef.current = next;
        }
      }
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
    setRecordState("acquiring");

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
          saveStoredDeviceId("");
          setSelectedDeviceId("");
          msg =
            "The previously selected microphone is no longer available. Try clicking Start recording again to use the default mic.";
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

    // Persist the actual deviceId in use (browsers sometimes resolve "default" to a real id).
    const settings = audioTrack?.getSettings?.();
    if (settings?.deviceId) {
      saveStoredDeviceId(settings.deviceId);
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
      startMeter(graph);
    }

    if (opts.forRecording) {
      startMediaRecorder();
    } else {
      setRecordState("ready");
    }
  }

  function startMediaRecorder(opts?: { continuation?: boolean }) {
    const continuation = opts?.continuation ?? false;
    const stream = streamRef.current;
    if (!stream) {
      setError("No microphone stream available.");
      setRecordState("error");
      return;
    }

    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);
    approachingCapSoundPlayedRef.current = false;
    rolloverInProgressRef.current = false;
    if (!continuation) {
      setSegmentNumber(1);
      totalSessionElapsedRef.current = 0;
    }

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

  /**
   * Single primary action. Acquires mic + starts recording in one shot for
   * first-time users (permission prompt → acquire → record). For users whose
   * mic was auto-acquired on mount, just starts the recorder reusing the live
   * graph (no re-prompt, no flicker).
   */
  async function handleStartRecording() {
    if (recordState === "ready" && streamRef.current) {
      startMediaRecorder();
    } else {
      await acquireMic({ deviceId: selectedDeviceId || undefined, forRecording: true });
    }
  }

  async function handleDeviceChange(newDeviceId: string) {
    setSelectedDeviceId(newDeviceId);
    saveStoredDeviceId(newDeviceId);
    // Re-acquire only when ready (we lock the picker mid-recording).
    if (recordState === "ready") {
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

  function stopAndUpload(mode: "final" | "rollover" = "final") {
    // No short-clip confirm: the live level meter now lets the tutor see that
    // their voice was captured, and the server-side `looksLikeSilenceHallucination`
    // guard rejects junk transcripts regardless of duration. Short legitimate
    // utterances ("bring the worksheet next time") are valid notes and shouldn't
    // be blocked behind a confirm popup.
    stopTimer();
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      rolloverInProgressRef.current = false;
      return;
    }

    const isRollover = mode === "rollover";
    setUploadMode(isRollover ? "segment" : "final");
    setRecordState("uploading");

    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || chooseMimeType();
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      const segmentSeconds = elapsedRef.current;
      const partIndex = segmentNumber;

      try {
        if (!isRollover) {
          teardownMicStream();
        }

        if (blob.size === 0) {
          setError("Recording appears empty. Please try again.");
          setUploadMode(null);
          if (isRollover) teardownMicStream();
          setRecordState("error");
          rolloverInProgressRef.current = false;
          return;
        }

        const ext = fileExtension(mimeType);
        const filename = `session-${Date.now()}-part${partIndex}.${ext}`;

        const result = await uploadAudioWithRetry(
          uploadAudioAction,
          studentId,
          blob,
          filename,
          mimeType
        );

        if (!result.ok) {
          setError(formatUserFacingActionError(result.error, result.debugId));
          setUploadMode(null);
          teardownMicStream();
          setRecordState("error");
          rolloverInProgressRef.current = false;
          return;
        }

        const previewUrl = URL.createObjectURL(blob);

        if (isRollover) {
          onRecorded(
            {
              blobUrl: result.blobUrl,
              mimeType,
              sizeBytes: blob.size,
              filename,
              previewUrl,
            },
            { autoRollover: true }
          );
          setUploadMode(null);
          mediaRecorderRef.current = null;
          setSegmentNumber((n) => n + 1);
          startMediaRecorder({ continuation: true });
          rolloverInProgressRef.current = false;
          return;
        }

        setDoneSegmentSeconds(segmentSeconds);
        setUploadMode(null);
        setRecordState("done");
        onRecorded({
          blobUrl: result.blobUrl,
          mimeType,
          sizeBytes: blob.size,
          filename,
          previewUrl,
        });
        rolloverInProgressRef.current = false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setError(msg);
        setUploadMode(null);
        teardownMicStream();
        setRecordState("error");
        rolloverInProgressRef.current = false;
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
    totalSessionElapsedRef.current = 0;
    approachingCapSoundPlayedRef.current = false;
    rolloverInProgressRef.current = false;
    setSegmentNumber(1);
    setUploadMode(null);
    setDoneSegmentSeconds(0);
    setError(null);
    setRecordState("idle");

    // Re-acquire the mic immediately if we have permission, so the meter and
    // picker come back to life without requiring an extra Start click. (The
    // auto-acquire useEffect only runs on mount; this same-instance reset
    // path needs an explicit kick.)
    void (async () => {
      const permission = await queryMicPermission();
      setPermissionState(permission);
      if (permission === "denied") return;
      await acquireMic({
        deviceId: loadStoredDeviceId() || undefined,
        forRecording: false,
      });
    })();
  }

  const isWarning = elapsed >= WARN_SEGMENT_SECONDS;
  const isLive =
    recordState === "ready" ||
    recordState === "recording" ||
    recordState === "paused" ||
    (recordState === "uploading" && uploadMode === "segment");
  const lockDevice =
    recordState === "recording" ||
    recordState === "paused" ||
    (recordState === "uploading" && uploadMode === "segment");

  // ----- Done / uploading short-circuits (no controls panel) -----

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
          ✓ Recording saved ({formatDuration(doneSegmentSeconds)})
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

  if (recordState === "uploading" && uploadMode === "segment") {
    const hintSeg = "Saving this segment — recording will resume automatically.";
    return (
      <div data-testid="audio-record-panel">
        <MicControls
          meterBarRef={meterBarRef}
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onDeviceChange={handleDeviceChange}
          gainLinear={gainLinear}
          onGainChange={setGainLinear}
          isLive={isLive}
          lockDevice={lockDevice}
          hint={hintSeg}
          chimeEnabled={chimeEnabled}
          onChimeEnabledChange={setChimeEnabled}
          chimeVolume={chimeVolume}
          onChimeVolumeChange={setChimeVolume}
        />
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

  if (recordState === "uploading" && uploadMode !== "segment") {
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

  if (recordState === "error") {
    return (
      <div data-testid="audio-record-panel">
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
      </div>
    );
  }

  // ----- Main panel: controls always visible, single primary action -----

  const hint =
    recordState === "idle"
      ? permissionState === "denied"
        ? "Microphone access is blocked for this site. Click the icon left of the address bar (lock or sliders), set Microphone to Allow, then reload."
        : "Click Start recording to allow mic access — after that the picker, boost slider, and meter will be live before each session."
      : recordState === "acquiring"
        ? "Requesting microphone access…"
        : undefined;

  return (
    <div data-testid="audio-record-panel">
      <MicControls
        meterBarRef={meterBarRef}
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onDeviceChange={handleDeviceChange}
        gainLinear={gainLinear}
        onGainChange={setGainLinear}
        isLive={isLive}
        lockDevice={lockDevice}
        hint={hint}
        chimeEnabled={chimeEnabled}
        onChimeEnabledChange={setChimeEnabled}
        chimeVolume={chimeVolume}
        onChimeVolumeChange={setChimeVolume}
      />

      {(recordState === "idle" || recordState === "acquiring" || recordState === "ready") && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="btn primary"
            onClick={handleStartRecording}
            disabled={disabled || recordState === "acquiring"}
            aria-label="Start recording"
            data-testid="audio-record-start"
          >
            {recordState === "acquiring" ? "● Connecting…" : "● Start recording"}
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
            {recordState === "ready"
              ? "Speak — watch the level bar — then click Start."
              : `Long sessions auto-save every ~${Math.round(SEGMENT_MAX_SECONDS / 60)} min so you can keep recording. Speak at least 15–20 seconds per segment when possible.`}
          </span>
        </div>
      )}

      {(recordState === "recording" || recordState === "paused") && (
        <div data-testid="audio-record-controls">
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
                {formatSegmentTimeLeft(SEGMENT_MAX_SECONDS - elapsed)} in this segment — will save &amp; continue automatically
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
              onClick={() => stopAndUpload("final")}
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

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
