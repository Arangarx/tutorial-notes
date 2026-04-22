"use client";

/**
 * Recorder lifecycle hook for the in-browser audio capture flow.
 *
 * Owns every ref + state + side-effect that previously lived inline in
 * AudioRecordInput. The shell component is now thin — destructure this hook
 * and pick a subview based on `state`.
 *
 * Invariants preserved verbatim from the pre-refactor recorder. Do not
 * "clean up" without re-reading the comment next to each one:
 *
 *  - iOS Safari MP4 fragmentation guard: `recorder.start()` is called with
 *    NO timeslice argument. Chunked output (start(1000)) makes iOS Safari
 *    emit fragmented MP4 pieces that don't concatenate into a playable /
 *    Whisper-decodable file.
 *  - StrictMode double-mount guard: per-effect `cancelled` flag PLUS a
 *    `streamRef.current` short-circuit. Do not introduce a module-level
 *    "already attempted" ref — that pattern blocks the legitimate
 *    post-remount auto-acquire after the parent re-keys this component.
 *  - Rollover keeps the mic hot: `stopAndUpload("rollover")` skips
 *    `teardownMicStream()` until after the segment uploads (or fails).
 *    Tearing down mid-rollover prompts iOS for permission again.
 *  - The meter is driven by direct DOM writes via `meterBarRef`, never via
 *    setState. A meter that re-rendered 60×/sec would kill mid-drag slider
 *    gestures and burn CPU.
 *  - The 1s timer's auto-rollover branch is single-shot per segment via
 *    `rolloverInProgressRef`. Without it, two timer ticks at the boundary
 *    can both call `stopAndUpload("rollover")`.
 *  - Gapless rollover (B5): on auto-rollover we PRE-WARM a second
 *    MediaRecorder on the same mic stream BEFORE calling .stop() on the
 *    current one. The old recorder's chunks are snapshotted to a LOCAL
 *    array and its ondataavailable handler is rebound to push into that
 *    local — otherwise the late "final flush" dataavailable that fires on
 *    .stop() would land in the NEW recorder's chunksRef and corrupt the
 *    next segment. Without the pre-warm there is a ~3-5s silent gap
 *    while the browser finalizes the WebM/MP4 container (this was
 *    Sarah's "4-second cutoff between recordings" report).
 */

import { useEffect, useRef, useState } from "react";
import { uploadAudioDirect } from "@/lib/recording/upload";
import { formatUserFacingActionError } from "@/lib/action-correlation";
import { createMicAudioGraph, type MicAudioGraph } from "@/lib/mic-recorder-audio";
import { chooseMimeType, fileExtension } from "@/lib/recording/mime";
import {
  SEGMENT_MAX_SECONDS,
  SESSION_SAFETY_MAX_SECONDS,
  WARN_SEGMENT_SECONDS,
  effectiveWarnSegmentSeconds,
  shouldFireApproachingChime,
  shouldHardStopSession,
  shouldRolloverSegment,
} from "@/lib/recording/segment-policy";
import {
  playApproachingMaxTimeChime,
  playSegmentRolloverChime,
} from "@/lib/recording/chimes";
import {
  CHIME_VOL_DEFAULT,
  GAIN_DEFAULT,
  loadStoredChimeEnabled,
  loadStoredChimeVolume,
  loadStoredDeviceId,
  loadStoredGain,
  saveStoredChimeEnabled,
  saveStoredChimeVolume,
  saveStoredDeviceId,
  saveStoredGain,
} from "@/lib/recording/storage";
import {
  queryMicPermission,
  type MicPermissionState,
} from "@/lib/recording/permissions";
import { uploadAudioWithRetry } from "@/lib/recording/upload";
import {
  ACTIVE_STATES,
  type RecordState,
  type UploadMode,
} from "@/lib/recording/recording-state";

export type RecordedAudio = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
  previewUrl?: string;
};

export type UseAudioRecorderOptions = {
  studentId: string;
  /** `autoRollover` when a segment was auto-saved mid-session; parent should append without remounting the recorder. */
  onRecorded: (audio: RecordedAudio, meta?: { autoRollover?: boolean }) => void;
  /** Called whenever the recording active state changes (acquiring/ready/recording/paused/uploading = true). */
  onRecordingActive?: (active: boolean) => void;
};

export type UseAudioRecorderReturn = {
  // FSM-derived state
  state: RecordState;
  uploadMode: UploadMode;

  // Timer / segment info
  elapsed: number;
  segmentNumber: number;
  doneSegmentSeconds: number;

  // Mic + prefs
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  gainLinear: number;
  setGainLinear: (n: number) => void;
  chimeEnabled: boolean;
  setChimeEnabled: (b: boolean) => void;
  chimeVolume: number;
  setChimeVolume: (n: number) => void;
  permissionState: MicPermissionState;

  // Errors
  error: string | null;

  // Derived UI flags
  /** Mic is hot — controls enabled, meter live. */
  isLive: boolean;
  /** Mic device picker should be locked (recording / paused / saving segment). */
  lockDevice: boolean;
  /** Show the "approaching segment cap" warning copy + colour. */
  isWarning: boolean;

  // Refs
  /** The shell wires this to the meter <div> so the rAF loop can write to it. */
  meterBarRef: React.RefObject<HTMLDivElement | null>;

  // Actions
  handleStartRecording: () => Promise<void> | void;
  handleDeviceChange: (deviceId: string) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopAndUpload: (mode?: "final" | "rollover") => void;
  handleReset: () => void;
};

/** Decide bar colour by level — green/yellow/red zones for visible feedback. */
function meterColor(level: number): string {
  if (level >= 0.85) return "var(--color-error, #dc2626)";
  if (level >= 0.5) return "#eab308"; // amber-500
  if (level >= 0.05) return "var(--color-success, #16a34a)";
  return "var(--color-muted, #9ca3af)";
}

export function useAudioRecorder({
  studentId,
  onRecorded,
  onRecordingActive,
}: UseAudioRecorderOptions): UseAudioRecorderReturn {
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [gainLinear, setGainLinear] = useState<number>(GAIN_DEFAULT);
  // SSR-safe defaults; the real localStorage values are read in the mount
  // effect below. Reading localStorage from the useState initializer would
  // produce a different value on the server (no localStorage = default) than
  // on the client (saved user preference), which React 19 surfaces as a
  // hydration mismatch on the chime volume slider's `--chime-pct` style.
  const [chimeEnabled, setChimeEnabled] = useState<boolean>(true);
  const [chimeVolume, setChimeVolume] = useState<number>(CHIME_VOL_DEFAULT);
  /** Current segment index (1-based) — increments on auto-rollover. */
  const [segmentNumber, setSegmentNumber] = useState(1);
  /** `segment` = saving mid-session without tearing down the mic; `final` = full-screen upload. */
  const [uploadMode, setUploadMode] = useState<UploadMode>(null);
  /** Duration shown on the success card after Stop & save (last segment only). */
  const [doneSegmentSeconds, setDoneSegmentSeconds] = useState(0);
  /** Last-known mic permission state, used only to pick the right hint copy. */
  const [permissionState, setPermissionState] = useState<MicPermissionState>("unknown");

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
  /** Latest segmentNumber, read by stopAndUpload's onstop closure to avoid stale state. */
  const segmentNumberRef = useRef(segmentNumber);

  useEffect(() => {
    chimeEnabledRef.current = chimeEnabled;
  }, [chimeEnabled]);
  useEffect(() => {
    chimeVolumeRef.current = chimeVolume;
  }, [chimeVolume]);
  useEffect(() => {
    segmentNumberRef.current = segmentNumber;
  }, [segmentNumber]);

  // Load persisted prefs after mount (avoid SSR/hydration mismatch).
  // chime values are loaded here too — see the chime useState declarations
  // above for why initialising them from localStorage causes a hydration
  // mismatch on the volume slider's `--chime-pct` CSS variable.
  useEffect(() => {
    setGainLinear(loadStoredGain());
    setSelectedDeviceId(loadStoredDeviceId());
    setChimeEnabled(loadStoredChimeEnabled());
    setChimeVolume(loadStoredChimeVolume());
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
        shouldFireApproachingChime(
          elapsedRef.current,
          approachingCapSoundPlayedRef.current
        )
      ) {
        approachingCapSoundPlayedRef.current = true;
        const vol = chimeEnabledRef.current ? chimeVolumeRef.current : 0;
        playApproachingMaxTimeChime(vol);
      }

      // Safety valve: very long continuous sessions (timer pauses when recording is paused).
      if (
        shouldHardStopSession(totalSessionElapsedRef.current) &&
        !rolloverInProgressRef.current
      ) {
        rolloverInProgressRef.current = true;
        stopAndUpload("final");
        return;
      }

      if (
        shouldRolloverSegment(elapsedRef.current) &&
        !rolloverInProgressRef.current
      ) {
        rolloverInProgressRef.current = true;
        const vol = chimeEnabledRef.current ? chimeVolumeRef.current : 0;
        playSegmentRolloverChime(vol);
        rolloverSegmentGapless();
      }
    }, 1000);
  }

  /**
   * Gapless segment rollover — see header invariant block.
   *
   * Sequence (every step matters; reorder at your peril):
   *
   *   1. Snapshot the OLD recorder + its in-flight chunks into LOCAL
   *      variables. After this point we don't touch chunksRef for the
   *      old segment again.
   *   2. Rebind the OLD recorder's ondataavailable to push into the
   *      local oldChunks. The browser will fire ondataavailable one
   *      more time when .stop() flushes the encoder, and it MUST not
   *      land in the new segment's buffer.
   *   3. Reset chunksRef.current = [] and build the NEW MediaRecorder
   *      on the same recordingStream. Start it immediately so the mic
   *      is captured continuously.
   *   4. Bump segmentNumber (state + ref) so the in-flight upload's
   *      part-N filename uses the OLD index and the live UI shows the
   *      NEW index.
   *   5. Wire the OLD recorder's .onstop to upload the snapshotted
   *      chunks in the background. The session keeps recording while
   *      that upload is in progress; on success we fire onRecorded
   *      with `{ autoRollover: true }` so the parent appends the file.
   *   6. Call oldRecorder.stop(). State stays "recording" the whole
   *      time — the user never sees an "uploading…" interstitial for
   *      auto-rollovers.
   *
   * Failure modes:
   *   - MediaRecorder constructor throws → we fall back to the legacy
   *     stop-then-restart path (`stopAndUpload("rollover")`). Worse
   *     UX (the gap returns) but session still completes.
   *   - Upload of the OLD segment fails after both retry attempts →
   *     we surface the error via setError but do NOT teardown the
   *     mic, since the new recorder is still capturing.
   */
  function rolloverSegmentGapless() {
    const oldRecorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    if (!oldRecorder || !stream) {
      rolloverInProgressRef.current = false;
      return;
    }

    const oldChunks: Blob[] = chunksRef.current;
    const oldSegmentSeconds = elapsedRef.current;
    const oldPartIndex = segmentNumberRef.current;
    const oldMimeType = oldRecorder.mimeType || chooseMimeType();

    // Step 2: rebind so the final-flush ondataavailable lands in oldChunks,
    // not the new recorder's chunksRef.
    oldRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) oldChunks.push(e.data);
    };

    // Step 3: build + start the NEW recorder BEFORE stopping the old one.
    const recordingStream = graphRef.current?.recordingStream ?? stream;
    let newRecorder: MediaRecorder;
    try {
      const newMimeType = chooseMimeType();
      newRecorder = new MediaRecorder(
        recordingStream,
        newMimeType ? { mimeType: newMimeType } : undefined
      );
    } catch (err) {
      // Pre-warm failed — fall back to the legacy path so we don't lose the
      // existing segment. We pay the gap but the session continues.
      console.warn(
        "[useAudioRecorder] gapless rollover pre-warm failed; falling back:",
        err
      );
      // Restore ondataavailable so chunksRef path still works (legacy path).
      oldRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rolloverInProgressRef.current = false;
      stopAndUpload("rollover");
      return;
    }

    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);
    approachingCapSoundPlayedRef.current = false;
    segmentNumberRef.current = oldPartIndex + 1;
    setSegmentNumber(oldPartIndex + 1);

    newRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    // Same iOS-Safari guard as startMediaRecorder: NO timeslice.
    newRecorder.start();
    mediaRecorderRef.current = newRecorder;

    // Step 5: background upload of the OLD segment.
    oldRecorder.onstop = async () => {
      const blob = new Blob(oldChunks, { type: oldMimeType });
      if (blob.size === 0) {
        // Empty segment is non-fatal during a rollover — the new segment is
        // already running. Log and clear the in-progress flag.
        console.warn(
          "[useAudioRecorder] rollover: old segment was empty, skipping upload"
        );
        rolloverInProgressRef.current = false;
        return;
      }

      const ext = fileExtension(oldMimeType);
      const filename = `session-${Date.now()}-part${oldPartIndex}.${ext}`;

      try {
        const result = await uploadAudioWithRetry(
          uploadAudioDirect,
          studentId,
          blob,
          filename,
          oldMimeType
        );

        if (!result.ok) {
          // Surface but keep the live recorder running. Tutor can read the
          // error and decide whether to stop; in the meantime we don't lose
          // the current capture.
          setError(formatUserFacingActionError(result.error, result.debugId));
          rolloverInProgressRef.current = false;
          return;
        }

        const previewUrl = URL.createObjectURL(blob);
        onRecorded(
          {
            blobUrl: result.blobUrl,
            mimeType: oldMimeType,
            sizeBytes: blob.size,
            filename,
            previewUrl,
          },
          { autoRollover: true }
        );
        rolloverInProgressRef.current = false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        console.error("[useAudioRecorder] rollover upload failed:", err);
        setError(msg);
        rolloverInProgressRef.current = false;
      }
      // oldSegmentSeconds is captured for parity with the legacy path's
      // doneSegmentSeconds; auto-rollover doesn't surface it in the UI
      // (state never goes to "done"), but keeping the snapshot makes
      // future telemetry trivial.
      void oldSegmentSeconds;
    };

    if (oldRecorder.state !== "inactive") {
      oldRecorder.stop();
    }
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
      console.error("[useAudioRecorder] getUserMedia failed:", err);
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
      console.warn("[useAudioRecorder] enumerateDevices failed:", err);
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
      segmentNumberRef.current = 1;
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
      // Read the live segment number via ref; the closure captured at
      // setInterval-creation time would otherwise see the stale value from
      // the render where startTimer() was first called.
      const partIndex = segmentNumberRef.current;

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
          uploadAudioDirect,
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
          // Update both state (for UI) and ref (for the next rollover's onstop closure).
          segmentNumberRef.current = partIndex + 1;
          setSegmentNumber(partIndex + 1);
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
    segmentNumberRef.current = 1;
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

  const isWarning = elapsed >= effectiveWarnSegmentSeconds();
  const isLive =
    recordState === "ready" ||
    recordState === "recording" ||
    recordState === "paused" ||
    (recordState === "uploading" && uploadMode === "segment");
  const lockDevice =
    recordState === "recording" ||
    recordState === "paused" ||
    (recordState === "uploading" && uploadMode === "segment");

  return {
    state: recordState,
    uploadMode,
    elapsed,
    segmentNumber,
    doneSegmentSeconds,
    devices,
    selectedDeviceId,
    gainLinear,
    setGainLinear,
    chimeEnabled,
    setChimeEnabled,
    chimeVolume,
    setChimeVolume,
    permissionState,
    error,
    isLive,
    lockDevice,
    isWarning,
    meterBarRef,
    handleStartRecording,
    handleDeviceChange,
    pauseRecording,
    resumeRecording,
    stopAndUpload,
    handleReset,
  };
}

// Re-export segment policy constants the shell still needs for copy.
export { SEGMENT_MAX_SECONDS, SESSION_SAFETY_MAX_SECONDS, WARN_SEGMENT_SECONDS };
