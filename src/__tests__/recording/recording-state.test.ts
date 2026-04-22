/**
 * Pure FSM tests. Lock the legal transitions so a future refactor of the
 * recorder hook can't accidentally drop the rollover-vs-final upload mode
 * distinction or leave `uploadMode` stale across resets.
 */

import {
  initialRecordingFsm,
  recordingReducer,
  ACTIVE_STATES,
  isActiveState,
  type RecorderEvent,
  type RecordingFsm,
} from "@/lib/recording/recording-state";

function reduce(initial: RecordingFsm, ...events: RecorderEvent[]): RecordingFsm {
  return events.reduce<RecordingFsm>(recordingReducer, initial);
}

describe("initialRecordingFsm", () => {
  test("starts idle with no upload mode", () => {
    expect(initialRecordingFsm).toEqual({ state: "idle", uploadMode: null });
  });
});

describe("ACTIVE_STATES", () => {
  test("includes recording, paused, uploading", () => {
    expect(ACTIVE_STATES).toEqual(expect.arrayContaining(["recording", "paused", "uploading"]));
  });

  test("excludes ready / acquiring (so the parent's Transcribe button is enabled while mic is hot but idle)", () => {
    expect(ACTIVE_STATES).not.toContain("ready");
    expect(ACTIVE_STATES).not.toContain("acquiring");
  });

  test("isActiveState matches ACTIVE_STATES membership", () => {
    expect(isActiveState("recording")).toBe(true);
    expect(isActiveState("paused")).toBe(true);
    expect(isActiveState("uploading")).toBe(true);
    expect(isActiveState("ready")).toBe(false);
    expect(isActiveState("idle")).toBe(false);
    expect(isActiveState("done")).toBe(false);
    expect(isActiveState("error")).toBe(false);
    expect(isActiveState("acquiring")).toBe(false);
  });
});

describe("acquire flow", () => {
  test("idle -> acquiring -> ready", () => {
    expect(
      reduce(initialRecordingFsm, { type: "ACQUIRE_START" }, { type: "ACQUIRE_READY" })
    ).toEqual({ state: "ready", uploadMode: null });
  });

  test("idle -> acquiring -> recording (when acquireMic was called for an immediate Start)", () => {
    expect(
      reduce(initialRecordingFsm, { type: "ACQUIRE_START" }, { type: "ACQUIRE_FOR_RECORD" })
    ).toEqual({ state: "recording", uploadMode: null });
  });

  test("acquire failure -> error", () => {
    expect(
      reduce(initialRecordingFsm, { type: "ACQUIRE_START" }, { type: "ACQUIRE_FAIL" })
    ).toEqual({ state: "error", uploadMode: null });
  });
});

describe("record / pause / resume", () => {
  const ready: RecordingFsm = { state: "ready", uploadMode: null };

  test("ready -> recording", () => {
    expect(recordingReducer(ready, { type: "START_RECORDING" })).toEqual({
      state: "recording",
      uploadMode: null,
    });
  });

  test("recording -> paused -> recording (pause/resume)", () => {
    const recording: RecordingFsm = { state: "recording", uploadMode: null };
    const paused = recordingReducer(recording, { type: "PAUSE" });
    expect(paused.state).toBe("paused");
    expect(recordingReducer(paused, { type: "RESUME" }).state).toBe("recording");
  });
});

describe("stop / upload modes", () => {
  const recording: RecordingFsm = { state: "recording", uploadMode: null };

  test("STOP_BEGIN final -> uploading + uploadMode=final", () => {
    expect(recordingReducer(recording, { type: "STOP_BEGIN", mode: "final" })).toEqual({
      state: "uploading",
      uploadMode: "final",
    });
  });

  test("STOP_BEGIN rollover -> uploading + uploadMode=segment", () => {
    expect(recordingReducer(recording, { type: "STOP_BEGIN", mode: "rollover" })).toEqual({
      state: "uploading",
      uploadMode: "segment",
    });
  });

  test("rollover upload success transitions back to recording with uploadMode cleared", () => {
    const uploading = recordingReducer(recording, { type: "STOP_BEGIN", mode: "rollover" });
    expect(recordingReducer(uploading, { type: "ROLLOVER_CONTINUE" })).toEqual({
      state: "recording",
      uploadMode: null,
    });
  });

  test("final upload success transitions to done with uploadMode cleared", () => {
    const uploading = recordingReducer(recording, { type: "STOP_BEGIN", mode: "final" });
    expect(recordingReducer(uploading, { type: "STOP_SUCCESS" })).toEqual({
      state: "done",
      uploadMode: null,
    });
  });

  test("upload failure transitions to error and clears uploadMode", () => {
    const uploading = recordingReducer(recording, { type: "STOP_BEGIN", mode: "final" });
    expect(recordingReducer(uploading, { type: "UPLOAD_FAIL" })).toEqual({
      state: "error",
      uploadMode: null,
    });
  });
});

describe("reset / error", () => {
  test("RESET clears uploadMode regardless of prior state", () => {
    const dirty: RecordingFsm = { state: "uploading", uploadMode: "segment" };
    expect(recordingReducer(dirty, { type: "RESET" })).toEqual({
      state: "idle",
      uploadMode: null,
    });
  });

  test("ERROR transitions from any state and clears uploadMode", () => {
    const recording: RecordingFsm = { state: "recording", uploadMode: null };
    expect(recordingReducer(recording, { type: "ERROR" }).state).toBe("error");
    const uploading: RecordingFsm = { state: "uploading", uploadMode: "final" };
    expect(recordingReducer(uploading, { type: "ERROR" })).toEqual({
      state: "error",
      uploadMode: null,
    });
  });
});

describe("end-to-end happy path", () => {
  test("full session: idle -> acquiring -> recording -> rollover -> recording -> stop -> done", () => {
    const final = reduce(
      initialRecordingFsm,
      { type: "ACQUIRE_START" },
      { type: "ACQUIRE_FOR_RECORD" },
      { type: "STOP_BEGIN", mode: "rollover" },
      { type: "ROLLOVER_CONTINUE" },
      { type: "STOP_BEGIN", mode: "final" },
      { type: "STOP_SUCCESS" }
    );
    expect(final).toEqual({ state: "done", uploadMode: null });
  });
});
