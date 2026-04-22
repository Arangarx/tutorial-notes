/**
 * @jest-environment jsdom
 */

/**
 * jsdom + RTL coverage for `useAudioRecorder` (Phase 3 of the recorder
 * test/refactor plan).
 *
 * Why this file exists: Phases 1+2 split the old 1212-line component into
 * pure modules + a hook + a thin shell, and unit-tested the pure modules
 * directly. Those tests can't catch the *integration* bugs that live where
 * the hook talks to MediaRecorder, the timer, and the upload chain — e.g.
 * "auto-rollover fires twice in the same segment" or "stop button passes
 * its synthetic MouseEvent as the mode arg". This file mocks just enough
 * of the browser API surface to drive those integration paths in jsdom.
 *
 * Mocks (kept fake-but-realistic on purpose):
 *  - `MediaRecorder` (global): controllable instance with `triggerStop()`
 *    and `getInstance()` test handles. Tracks state (`inactive` / `recording`
 *    / `paused`) and call counts.
 *  - `navigator.mediaDevices.getUserMedia` / `enumerateDevices` and
 *    `navigator.permissions.query`: granted by default, single fake
 *    audioinput device.
 *  - `URL.createObjectURL`: returns a stable string. Real jsdom impl can
 *    work but isn't worth the variability.
 *  - `@/lib/mic-recorder-audio`: forced to return `null` from
 *    `createMicAudioGraph` so the hook falls back to the raw stream path.
 *    The graph itself is covered by `mic-recorder-audio.test.ts`.
 *  - `@/lib/recording/upload`: `uploadAudioDirect` mocked per test
 *    (success / failure / retry-then-success). Pre-B1 this mock was on
 *    the legacy `uploadAudioAction` server action; that path was
 *    removed when client-direct upload landed.
 *
 * NOT testing here (covered elsewhere or out of scope):
 *  - MIME priority — `src/__tests__/recording/mime.test.ts`.
 *  - `recorder.start()` no-timeslice — regression grep in
 *    `audio-mime-priority.test.ts`.
 *  - Storage round-trip / chime audio context — Phase 1 unit tests.
 *  - Permission-denied UI copy — covered by acquireMic logic; would need
 *    a separate dedicated rejected-getUserMedia case if we see flakes.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAudioRecorder,
  SEGMENT_MAX_SECONDS,
  SESSION_SAFETY_MAX_SECONDS,
} from "@/hooks/useAudioRecorder";

// ---- Mocks for hook dependencies ----------------------------------------

// Force the audio graph to be unavailable so the hook uses the raw stream
// path. The graph itself has its own unit test; here we want determinism.
jest.mock("@/lib/mic-recorder-audio", () => ({
  __esModule: true,
  createMicAudioGraph: jest.fn(async () => null),
}));

// uploadAudioDirect is the thing the hook hands to uploadAudioWithRetry.
// Tests override its return value per case. We re-export the real
// uploadAudioWithRetry and UploadAudioFn type so the retry policy is
// exercised against the mock; only the leaf uploader is stubbed.
jest.mock("@/lib/recording/upload", () => {
  const actual = jest.requireActual("@/lib/recording/upload");
  return {
    __esModule: true,
    ...actual,
    uploadAudioDirect: jest.fn(),
  };
});

// formatUserFacingActionError is pure; pass through with predictable text.
jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  formatUserFacingActionError: (msg: string, debugId?: string) =>
    debugId ? `${msg} [debug=${debugId}]` : msg,
}));

import { uploadAudioDirect } from "@/lib/recording/upload";

// ---- Fake MediaRecorder --------------------------------------------------

type FakeRecorderState = "inactive" | "recording" | "paused";

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static lastInstance(): FakeMediaRecorder {
    const last = FakeMediaRecorder.instances.at(-1);
    if (!last) throw new Error("no FakeMediaRecorder created yet");
    return last;
  }
  static reset() {
    FakeMediaRecorder.instances = [];
  }

  state: FakeRecorderState = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;

  startCalls: unknown[][] = [];
  stopCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;

  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "audio/webm;codecs=opus";
    FakeMediaRecorder.instances.push(this);
  }

  start(...args: unknown[]) {
    this.startCalls.push(args);
    this.state = "recording";
  }
  pause() {
    this.pauseCalls += 1;
    if (this.state === "recording") this.state = "paused";
  }
  resume() {
    this.resumeCalls += 1;
    if (this.state === "paused") this.state = "recording";
  }
  stop() {
    this.stopCalls += 1;
    this.state = "inactive";
    // The hook calls recorder.stop() AFTER assigning recorder.onstop, so the
    // assignment is in place by the time we fire it. Real browsers fire it
    // asynchronously; we do too, via a microtask, so the awaiting code runs.
    queueMicrotask(() => {
      this.onstop?.();
    });
  }

  /** Test handle: simulate a dataavailable event with a non-empty blob. */
  feedData(blob: Blob = new Blob(["ok"], { type: this.mimeType })) {
    this.ondataavailable?.({ data: blob });
  }
}

(globalThis as unknown as { MediaRecorder: typeof FakeMediaRecorder }).MediaRecorder =
  FakeMediaRecorder;
// `isTypeSupported` is consulted by chooseMimeType; have it accept anything.
(FakeMediaRecorder as unknown as { isTypeSupported: (t: string) => boolean }).isTypeSupported =
  () => true;

// ---- navigator.mediaDevices + permissions --------------------------------

function installMediaDevicesMock() {
  const fakeTrack = {
    stop: jest.fn(),
    getSettings: () => ({ deviceId: "fake-mic-id" }),
  };
  const fakeStream = {
    getTracks: () => [fakeTrack],
    getAudioTracks: () => [fakeTrack],
  } as unknown as MediaStream;

  const getUserMedia = jest.fn(async () => fakeStream);
  const enumerateDevices = jest.fn(async () => [
    { kind: "audioinput", deviceId: "fake-mic-id", label: "Fake Mic", groupId: "" },
  ] as MediaDeviceInfo[]);

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: jest.fn(async () => ({ state: "granted" })) },
  });

  return { fakeStream, fakeTrack, getUserMedia, enumerateDevices };
}

// jsdom provides URL.createObjectURL only sometimes; pin it so blob previews
// don't blow up.
const originalCreateObjectURL = URL.createObjectURL;
beforeAll(() => {
  URL.createObjectURL = jest.fn(() => "blob://fake-preview");
});
afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL;
});

// ---- Test plumbing --------------------------------------------------------

const uploadMock = uploadAudioDirect as unknown as jest.Mock;

function mockUploadOk(blobUrl = "https://blob.example/x") {
  uploadMock.mockResolvedValue({ ok: true, blobUrl, mimeType: "audio/webm", sizeBytes: 1 });
}
function mockUploadFail(error = "boom", debugId?: string) {
  uploadMock.mockResolvedValue({ ok: false, error, debugId });
}

/** Render the hook with a recording-active observer + a mocked onRecorded. */
function renderRecorder(overrides: { studentId?: string } = {}) {
  const onRecorded = jest.fn();
  const onRecordingActive = jest.fn();
  const view = renderHook(() =>
    useAudioRecorder({
      studentId: overrides.studentId ?? "stu-1",
      onRecorded,
      onRecordingActive,
    })
  );
  return { ...view, onRecorded, onRecordingActive };
}

/**
 * Drain pending microtasks. Long because the longest chain we drive
 * (auto-rollover: stop → upload → handle → start new recorder) is several
 * `await` hops, each yielding to a separate microtask.
 *
 * Uses `act` so React batches state updates correctly. Loops 20 times —
 * cheap and well above any chain we currently exercise.
 */
async function flushAsync() {
  await act(async () => {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  // CRITICAL: `doNotFake: ['queueMicrotask']`. Jest 30's modern fake timers
  // also intercept `queueMicrotask` by default, which means the FakeMediaRecorder
  // `stop()` callback (queued via `queueMicrotask`) never fires unless we tick
  // timers explicitly — even though there's no real timer to tick. Excluding
  // it lets the upload chain progress naturally.
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  FakeMediaRecorder.reset();
  installMediaDevicesMock();
  uploadMock.mockReset();
  // Silence the StrictMode-style console.error from the hook's getUserMedia
  // catch path — we test those branches directly without polluting stdout.
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---- Tests ----------------------------------------------------------------

describe("useAudioRecorder — start → stop (final)", () => {
  test("happy path: idle → ready → recording → uploading → done; onRecorded called once", async () => {
    mockUploadOk("https://blob.example/p1");
    const { result, onRecorded, onRecordingActive } = renderRecorder();

    // Auto-acquire on mount lands us in `ready`.
    await flushAsync();
    expect(result.current.state).toBe("ready");

    // Start recording (reuses live stream — no re-acquire).
    await act(async () => {
      await result.current.handleStartRecording();
    });
    expect(result.current.state).toBe("recording");
    expect(FakeMediaRecorder.instances).toHaveLength(1);

    // Feed a chunk so the upload blob isn't empty, then stop.
    const recorder = FakeMediaRecorder.lastInstance();
    recorder.feedData();
    await act(async () => {
      result.current.stopAndUpload("final");
      await flushAsync();
    });

    expect(result.current.state).toBe("done");
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const [audio, meta] = onRecorded.mock.calls[0];
    expect(audio).toMatchObject({
      blobUrl: "https://blob.example/p1",
      mimeType: expect.any(String),
      filename: expect.stringMatching(/^session-\d+-part1\./),
    });
    expect(meta).toBeUndefined();

    // onRecordingActive flips: idle(false) → acquiring(true) → ready(true) →
    // recording(true) → uploading(true) → done(false). We don't assert exact
    // sequence — just that the parent saw both "active" and "inactive".
    const calls = onRecordingActive.mock.calls.map((c) => c[0]);
    expect(calls).toContain(true);
    expect(calls.at(-1)).toBe(false);
  });

  test("regression: stop button onClick passing a MouseEvent as `mode` defaults to final", async () => {
    // The shell does `onClick={() => r.stopAndUpload("final")}`. If a future
    // refactor regresses to `onClick={r.stopAndUpload}`, React passes the
    // synthetic MouseEvent as the first arg. The hook must not crash and
    // must NOT auto-rollover (which would keep the mic hot when the user
    // intended to stop).
    mockUploadOk();
    const { result } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();

    await act(async () => {
      // Cast: this is exactly what the bug looked like in the wild.
      (result.current.stopAndUpload as unknown as (e: object) => void)({
        type: "click",
        preventDefault: () => {},
      });
      await flushAsync();
    });

    // A MouseEvent is "truthy and not 'rollover'", so isRollover is false →
    // final flow runs. State must end up `done`, not `recording`.
    expect(result.current.state).toBe("done");
  });
});

describe("useAudioRecorder — pause / resume timer math", () => {
  test("timer freezes on pause and continues on resume", async () => {
    mockUploadOk();
    const { result } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });

    // Tick 5 seconds.
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.elapsed).toBe(5);

    // Pause → 10 wall-clock seconds pass → elapsed unchanged.
    await act(async () => {
      result.current.pauseRecording();
    });
    expect(result.current.state).toBe("paused");
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(result.current.elapsed).toBe(5);

    // Resume → 3 more ticks → elapsed = 8.
    await act(async () => {
      result.current.resumeRecording();
    });
    expect(result.current.state).toBe("recording");
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.elapsed).toBe(8);
  });
});

describe("useAudioRecorder — auto-rollover at SEGMENT_MAX_SECONDS", () => {
  test("rolls over: onRecorded(autoRollover=true), starts fresh recorder, segmentNumber++", async () => {
    mockUploadOk("https://blob.example/seg1");
    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });

    expect(result.current.segmentNumber).toBe(1);
    const firstRecorder = FakeMediaRecorder.lastInstance();
    firstRecorder.feedData();

    // Cross the segment boundary: timer ticks SEGMENT_MAX_SECONDS times.
    await act(async () => {
      jest.advanceTimersByTime(SEGMENT_MAX_SECONDS * 1000);
      await flushAsync();
    });

    // Parent was told this was an auto-rollover.
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const [, meta] = onRecorded.mock.calls[0];
    expect(meta).toEqual({ autoRollover: true });

    // A second recorder instance exists and is recording.
    expect(FakeMediaRecorder.instances).toHaveLength(2);
    const secondRecorder = FakeMediaRecorder.lastInstance();
    expect(secondRecorder).not.toBe(firstRecorder);
    expect(secondRecorder.state).toBe("recording");

    // Segment counter advanced; UI is back in `recording`.
    expect(result.current.segmentNumber).toBe(2);
    expect(result.current.state).toBe("recording");

    // Segment 2 file naming uses part2 (regression for the segmentNumberRef
    // staleness bug we folded into Phase 2).
    secondRecorder.feedData();
    mockUploadOk("https://blob.example/seg2");
    await act(async () => {
      result.current.stopAndUpload("final");
      await flushAsync();
    });
    const [audio2] = onRecorded.mock.calls[1];
    expect(audio2.filename).toMatch(/-part2\./);
  });

  test("double-rollover guard: two rapid timer ticks at the boundary fire stop ONCE", async () => {
    mockUploadOk();
    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    const firstRecorder = FakeMediaRecorder.lastInstance();
    firstRecorder.feedData();

    // Push past the boundary in a single advance — multiple 1s ticks fire,
    // but the in-progress guard should prevent a second stopAndUpload.
    await act(async () => {
      jest.advanceTimersByTime((SEGMENT_MAX_SECONDS + 5) * 1000);
      await flushAsync();
    });

    expect(firstRecorder.stopCalls).toBe(1);
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });
});

describe("useAudioRecorder — session safety cap", () => {
  test("hits SESSION_SAFETY_MAX_SECONDS → stops as final, not rollover", async () => {
    mockUploadOk();
    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    // Feed at least one chunk per segment so the hard-stop blob isn't empty.
    FakeMediaRecorder.lastInstance().feedData();

    // Walk the timer past the safety cap. Several auto-rollovers will fire
    // along the way; each triggers an upload (still mocked ok). We feed a
    // chunk after each new recorder appears so subsequent uploads are
    // also non-empty.
    let lastInstanceCount = FakeMediaRecorder.instances.length;
    for (let elapsed = 0; elapsed < SESSION_SAFETY_MAX_SECONDS + 5; elapsed += 60) {
      await act(async () => {
        jest.advanceTimersByTime(60_000);
        await flushAsync();
      });
      if (FakeMediaRecorder.instances.length !== lastInstanceCount) {
        FakeMediaRecorder.lastInstance().feedData();
        lastInstanceCount = FakeMediaRecorder.instances.length;
      }
    }

    // We hit the hard stop: state is `done` (not still recording), and the
    // FINAL onRecorded call has no autoRollover flag.
    expect(result.current.state).toBe("done");
    const finalCall = onRecorded.mock.calls.at(-1)!;
    expect(finalCall[1]).toBeUndefined();
  });
});

describe("useAudioRecorder — upload failures", () => {
  test("retry-once succeeds: first upload fails, second succeeds → done", async () => {
    uploadMock
      .mockResolvedValueOnce({ ok: false, error: "transient" })
      .mockResolvedValueOnce({ ok: true, blobUrl: "https://blob.example/retry", mimeType: "audio/webm", sizeBytes: 1 });

    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();

    await act(async () => {
      result.current.stopAndUpload("final");
      await flushAsync();
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("done");
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  test("both attempts fail → state = error, onRecorded not called", async () => {
    mockUploadFail("network down", "rid-42");
    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();

    await act(async () => {
      result.current.stopAndUpload("final");
      await flushAsync();
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("error");
    // Surfaced through formatUserFacingActionError mock.
    expect(result.current.error).toBe("network down [debug=rid-42]");
    expect(onRecorded).not.toHaveBeenCalled();
  });
});
