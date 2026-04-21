/**
 * Pure reducer for the audio recorder's UI state machine.
 *
 * Replaces the scattered `setRecordState(...)` / `setUploadMode(...)` calls
 * in the recorder hook with one well-typed transition fn, so:
 *   - adding a new state requires updating one place,
 *   - the legal transitions are documented in code (see the switch),
 *   - tests can assert behaviour without rendering React.
 *
 * Why state + uploadMode are co-managed: they're tightly coupled. A "uploading"
 * state with `uploadMode === "segment"` means we're saving a segment mid-rollover
 * (mic stays hot); `uploadMode === "final"` means the user pressed Stop & save
 * (mic will tear down). The reducer enforces this pairing.
 */

export type RecordState =
  | "idle"
  | "acquiring"
  | "ready"
  | "recording"
  | "paused"
  | "uploading"
  | "done"
  | "error";

export type UploadMode = null | "segment" | "final";

export type RecordingFsm = {
  state: RecordState;
  uploadMode: UploadMode;
};

export type RecorderEvent =
  | { type: "ACQUIRE_START" }
  | { type: "ACQUIRE_READY" }
  | { type: "ACQUIRE_FOR_RECORD" }
  | { type: "ACQUIRE_FAIL" }
  | { type: "START_RECORDING" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP_BEGIN"; mode: "final" | "rollover" }
  | { type: "ROLLOVER_CONTINUE" }
  | { type: "STOP_SUCCESS" }
  | { type: "UPLOAD_FAIL" }
  | { type: "RESET" }
  | { type: "ERROR" };

export const initialRecordingFsm: RecordingFsm = {
  state: "idle",
  uploadMode: null,
};

/**
 * States the parent panel should treat as "recording in progress" — used to
 * disable the "Transcribe & generate notes" button so the user can't kick off
 * transcription mid-capture. With auto-acquire-on-mount, the mic stays hot
 * (graph + meter live) in `ready` even when no recording is happening, so
 * `ready` and `acquiring` deliberately do NOT count as active.
 */
export const ACTIVE_STATES: RecordState[] = ["recording", "paused", "uploading"];

export function isActiveState(state: RecordState): boolean {
  return ACTIVE_STATES.includes(state);
}

export function recordingReducer(
  state: RecordingFsm,
  event: RecorderEvent
): RecordingFsm {
  switch (event.type) {
    case "ACQUIRE_START":
      return { ...state, state: "acquiring" };
    case "ACQUIRE_READY":
      return { state: "ready", uploadMode: null };
    case "ACQUIRE_FOR_RECORD":
      return { state: "recording", uploadMode: null };
    case "ACQUIRE_FAIL":
      return { state: "error", uploadMode: null };
    case "START_RECORDING":
      return { state: "recording", uploadMode: null };
    case "PAUSE":
      return { ...state, state: "paused" };
    case "RESUME":
      return { ...state, state: "recording" };
    case "STOP_BEGIN":
      return {
        state: "uploading",
        uploadMode: event.mode === "rollover" ? "segment" : "final",
      };
    case "ROLLOVER_CONTINUE":
      return { state: "recording", uploadMode: null };
    case "STOP_SUCCESS":
      return { state: "done", uploadMode: null };
    case "UPLOAD_FAIL":
      return { state: "error", uploadMode: null };
    case "RESET":
      return { state: "idle", uploadMode: null };
    case "ERROR":
      return { state: "error", uploadMode: null };
  }
}
