"use client";

import {
  GAIN_MAX,
  GAIN_MIN,
  CHIME_VOL_MAX,
  CHIME_VOL_MIN,
} from "@/lib/recording/storage";
import {
  SEGMENT_MAX_SECONDS,
  formatSegmentTimeLeft,
} from "@/lib/recording/segment-policy";
import {
  useAudioRecorder,
  type RecordedAudio,
} from "@/hooks/useAudioRecorder";

export type { RecordedAudio };

type Props = {
  studentId: string;
  /** `autoRollover` when a segment was auto-saved mid-session; parent should append without remounting the recorder. */
  onRecorded: (audio: RecordedAudio, meta?: { autoRollover?: boolean }) => void;
  /** Called whenever the recording active state changes (acquiring/ready/recording/paused/uploading = true). */
  onRecordingActive?: (active: boolean) => void;
  disabled?: boolean;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
//
// Phase 4 of the recorder refactor will move this into its own file
// alongside a CSS module for the inline <style> block at the bottom.
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
// AudioRecordInput — thin shell over useAudioRecorder.
//
// Owns ZERO recording logic. Picks a subview based on `state` + `uploadMode`
// from the hook. Phase 4 of the refactor will pull each branch into its own
// presentational component.
// =====================================================================

export default function AudioRecordInput({
  studentId,
  onRecorded,
  onRecordingActive,
  disabled,
}: Props) {
  const r = useAudioRecorder({ studentId, onRecorded, onRecordingActive });

  // ----- Done / uploading / error short-circuits -----

  if (r.state === "done") {
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
          ✓ Recording saved ({formatDuration(r.doneSegmentSeconds)})
        </span>
        <button
          type="button"
          className="btn"
          style={{ marginLeft: "auto", fontSize: 12 }}
          onClick={r.handleReset}
        >
          Re-record
        </button>
      </div>
    );
  }

  if (r.state === "uploading" && r.uploadMode === "segment") {
    const hintSeg = "Saving this segment — recording will resume automatically.";
    return (
      <div data-testid="audio-record-panel">
        <MicControls
          meterBarRef={r.meterBarRef}
          devices={r.devices}
          selectedDeviceId={r.selectedDeviceId}
          onDeviceChange={r.handleDeviceChange}
          gainLinear={r.gainLinear}
          onGainChange={r.setGainLinear}
          isLive={r.isLive}
          lockDevice={r.lockDevice}
          hint={hintSeg}
          chimeEnabled={r.chimeEnabled}
          onChimeEnabledChange={r.setChimeEnabled}
          chimeVolume={r.chimeVolume}
          onChimeVolumeChange={r.setChimeVolume}
        />
        <div data-testid="audio-record-uploading-segment" style={{ marginTop: 10 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--color-muted, #6b7280)" }}>
            Saving segment {r.segmentNumber}… you&apos;ll keep recording in a moment.
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

  if (r.state === "uploading" && r.uploadMode !== "segment") {
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

  if (r.state === "error") {
    return (
      <div data-testid="audio-record-panel">
        {r.error && (
          <p
            role="alert"
            style={{ fontSize: 13, color: "var(--color-error, #dc2626)", margin: "0 0 10px" }}
            data-testid="audio-record-error"
          >
            {r.error}
          </p>
        )}
        <button type="button" className="btn" onClick={r.handleReset}>
          Try again
        </button>
      </div>
    );
  }

  // ----- Main panel: controls always visible, single primary action -----

  const hint =
    r.state === "idle"
      ? r.permissionState === "denied"
        ? "Microphone access is blocked for this site. Click the icon left of the address bar (lock or sliders), set Microphone to Allow, then reload."
        : "Click Start recording to allow mic access — after that the picker, boost slider, and meter will be live before each session."
      : r.state === "acquiring"
        ? "Requesting microphone access…"
        : undefined;

  return (
    <div data-testid="audio-record-panel">
      <MicControls
        meterBarRef={r.meterBarRef}
        devices={r.devices}
        selectedDeviceId={r.selectedDeviceId}
        onDeviceChange={r.handleDeviceChange}
        gainLinear={r.gainLinear}
        onGainChange={r.setGainLinear}
        isLive={r.isLive}
        lockDevice={r.lockDevice}
        hint={hint}
        chimeEnabled={r.chimeEnabled}
        onChimeEnabledChange={r.setChimeEnabled}
        chimeVolume={r.chimeVolume}
        onChimeVolumeChange={r.setChimeVolume}
      />

      {(r.state === "idle" || r.state === "acquiring" || r.state === "ready") && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="btn primary"
            onClick={r.handleStartRecording}
            disabled={disabled || r.state === "acquiring"}
            aria-label="Start recording"
            data-testid="audio-record-start"
          >
            {r.state === "acquiring" ? "● Connecting…" : "● Start recording"}
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
            {r.state === "ready"
              ? "Speak — watch the level bar — then click Start."
              : `Long sessions auto-save every ~${Math.round(SEGMENT_MAX_SECONDS / 60)} min so you can keep recording. Speak at least 15–20 seconds per segment when possible.`}
          </span>
        </div>
      )}

      {(r.state === "recording" || r.state === "paused") && (
        <div data-testid="audio-record-controls">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: r.state === "recording"
                  ? "var(--color-error, #dc2626)"
                  : "var(--color-muted, #9ca3af)",
                animation: r.state === "recording" ? "pulse 1s infinite" : undefined,
              }}
            />
            <span
              aria-live="polite"
              aria-label={`Segment ${r.segmentNumber}, duration ${formatDuration(r.elapsed)}`}
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                fontSize: 18,
                color: r.isWarning ? "var(--color-error, #dc2626)" : undefined,
              }}
            >
              Part {r.segmentNumber} · {formatDuration(r.elapsed)}
            </span>
            {r.isWarning && (
              <span role="alert" style={{ fontSize: 12, color: "var(--color-error, #dc2626)" }}>
                {formatSegmentTimeLeft(SEGMENT_MAX_SECONDS - r.elapsed)} in this segment — will save &amp; continue automatically
              </span>
            )}
            <span aria-live="polite" style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-muted, #6b7280)" }}>
              {r.state === "paused" ? "Paused" : "Recording…"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {r.state === "recording" ? (
              <button
                type="button"
                className="btn"
                onClick={r.pauseRecording}
                aria-label="Pause recording"
                data-testid="audio-record-pause"
              >
                ⏸ Pause
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={r.resumeRecording}
                aria-label="Resume recording"
                data-testid="audio-record-resume"
              >
                ▶ Resume
              </button>
            )}
            {/* Wrap stopAndUpload in an arrow so the synthetic MouseEvent isn't
                passed as the `mode` argument — that regression was caught and
                fixed live; do not change to onClick={r.stopAndUpload}. */}
            <button
              type="button"
              className="btn primary"
              onClick={() => r.stopAndUpload("final")}
              aria-label="Stop and save recording"
              data-testid="audio-record-stop"
            >
              ■ Stop & save
            </button>
            <button
              type="button"
              className="btn"
              style={{ marginLeft: "auto" }}
              onClick={r.handleReset}
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
