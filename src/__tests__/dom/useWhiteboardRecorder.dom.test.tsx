/**
 * @jest-environment jsdom
 */

/**
 * jsdom + RTL coverage for `useWhiteboardRecorder`.
 *
 * Exercises the integration seams that pure-module tests can't:
 *   - the recordingActive gate (off ⇒ no events)
 *   - off→on snapshot + on→off pause markers
 *   - throttled diff path (one diff per DIFF_INTERVAL_MS, last-write-wins)
 *   - ingestRemote tags peerId on `add` events
 *   - visibilitychange emits markers + flushes IDB
 *   - resume-from-crash detection on mount + acceptResume restoration
 *
 * IndexedDB is provided by `fake-indexeddb`. We DO NOT mock the
 * checkpoint store — exercising the real save / find / clear path
 * is the whole point of this file (anything less just rewrites the
 * store's own unit tests).
 */

import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/react";

import {
  useWhiteboardRecorder,
  type WhiteboardSyncClientLike,
} from "@/hooks/useWhiteboardRecorder";
import {
  _resetCheckpointStoreForTests,
  saveCheckpoint,
  whiteboardOwnerKey,
  findCheckpoint,
} from "@/lib/whiteboard/checkpoint-store";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import type { WBEventLog } from "@/lib/whiteboard/event-log";

const ADMIN = "admin-1";
const STUDENT = "student-1";
const SESSION = "wb-session-1";

function makeRect(id: string, x: number, y: number): ExcalidrawLikeElement {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: 100,
    height: 50,
    strokeColor: "#000",
  };
}

type Bag = { now: number };

function defaultProps(bag: Bag, overrides?: Partial<Parameters<typeof useWhiteboardRecorder>[0]>) {
  return {
    whiteboardSessionId: SESSION,
    adminUserId: ADMIN,
    studentId: STUDENT,
    startedAtIso: "2026-04-23T10:00:00.000Z",
    getAudioMs: () => bag.now,
    recordingActive: true,
    sync: null,
    localClientId: "local-tutor",
    ...overrides,
  };
}

/**
 * Helper: run several microtask rounds. fake-indexeddb resolves its
 * request promises across many `queueMicrotask` ticks, so a single
 * `await Promise.resolve()` is rarely enough to let saveCheckpoint /
 * findCheckpoint settle. Eight rounds is empirically more than enough
 * for any single IDB op without slowing the suite.
 */
async function flushIDB(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  _resetCheckpointStoreForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useWhiteboardRecorder", () => {
  test("onCanvasChange emits a snapshot then diff events while recording is active", async () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook((p: { active: boolean }) =>
      useWhiteboardRecorder(defaultProps(bag, { recordingActive: p.active }))
    , { initialProps: { active: false } });

    // Off → on flips recordingActive; the effect runs on next render.
    act(() => {
      rerender({ active: true });
    });

    // First user stroke: a single rectangle.
    bag.now = 250;
    act(() => {
      result.current.onCanvasChange([makeRect("r1", 10, 20)]);
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });

    // Second stroke: same rectangle moved + a new one.
    bag.now = 500;
    act(() => {
      result.current.onCanvasChange([
        makeRect("r1", 30, 40),
        makeRect("r2", 100, 100),
      ]);
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });

    // Snapshot (off→on with empty scene) + add r1 + update r1 + add r2 = 4
    expect(result.current.eventCount).toBe(4);
    const json = result.current.buildFinalEventsJson();
    const log = JSON.parse(json) as WBEventLog;
    expect(log.events[0].type).toBe("snapshot");
    expect(log.events[1].type).toBe("add");
    expect(log.events[2].type).toBe("update");
    expect(log.events[3].type).toBe("add");
    // clientId stamped on adds
    if (log.events[1].type === "add") {
      expect(log.events[1].element.clientId).toBe("local-tutor");
    }
    // duration tracks the last t emitted
    expect(log.durationMs).toBe(500);
  });

  test("recordingActive=false discards canvas changes (no events logged)", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result } = renderHook(() =>
      useWhiteboardRecorder(defaultProps(bag, { recordingActive: false }))
    );

    bag.now = 100;
    act(() => {
      result.current.onCanvasChange([makeRect("r1", 0, 0)]);
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });

    expect(result.current.eventCount).toBe(0);
  });

  test("recordingActive=false still broadcasts to sync (live whiteboard while log is idle)", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const broadcastScene = jest.fn();
    const sync: WhiteboardSyncClientLike = {
      isConnected: () => true,
      onConnect: () => () => {},
      onDisconnect: () => () => {},
      onRemoteScene: () => () => {},
      broadcastScene,
    };
    const { result } = renderHook(() =>
      useWhiteboardRecorder(defaultProps(bag, { recordingActive: false, sync }))
    );

    const stroke = [makeRect("r1", 0, 0)];
    bag.now = 100;
    act(() => {
      result.current.onCanvasChange(stroke);
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });

    expect(result.current.eventCount).toBe(0);
    expect(broadcastScene).toHaveBeenCalledTimes(1);
    expect(broadcastScene).toHaveBeenCalledWith(stroke, undefined);
  });

  test("on→off transition emits a pause marker and flushes pending diff at the right t", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook((p: { active: boolean }) =>
      useWhiteboardRecorder(defaultProps(bag, { recordingActive: p.active }))
    , { initialProps: { active: true } });

    bag.now = 750;
    act(() => {
      result.current.onCanvasChange([makeRect("r1", 0, 0)]);
    });
    // Pause BEFORE the throttle timer fires — the pause path must
    // still capture this stroke (otherwise we'd lose the last stroke
    // before pause every time).
    bag.now = 800;
    act(() => {
      rerender({ active: false });
    });

    const log = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    const types = log.events.map((e) => e.type);
    expect(types).toContain("pause");
    expect(types).toContain("add");
    // pause is the last event
    expect(types[types.length - 1]).toBe("pause");
  });

  test("ingestRemote tags peerId on add events (replay attribution)", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook((p: { active: boolean }) =>
      useWhiteboardRecorder(defaultProps(bag, { recordingActive: p.active }))
    , { initialProps: { active: false } });
    act(() => {
      rerender({ active: true });
    });

    bag.now = 1000;
    act(() => {
      result.current.ingestRemote("student-peer", [makeRect("s1", 0, 0)]);
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });

    const log = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    const add = log.events.find((e) => e.type === "add");
    expect(add).toBeDefined();
    if (add && add.type === "add") {
      expect(add.element.clientId).toBe("student-peer");
    }
  });

  test("visibilitychange to hidden emits tab-hidden marker", async () => {
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook((p: { active: boolean }) =>
      useWhiteboardRecorder(defaultProps(bag, { recordingActive: p.active }))
    , { initialProps: { active: false } });
    act(() => {
      rerender({ active: true });
    });

    // Force the doc into hidden — jsdom respects manual property writes
    // even though `document.hidden` is normally a getter.
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    bag.now = 2000;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const log = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    const types = log.events.map((e) => e.type);
    expect(types).toContain("tab-hidden");

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const log2 = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    expect(log2.events.map((e) => e.type)).toContain("tab-visible");
  });

  test("sync-client connect/disconnect emits markers while active", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    let connectCb: (() => void) | null = null;
    let disconnectCb: (() => void) | null = null;
    const sync: WhiteboardSyncClientLike = {
      isConnected: () => false,
      onConnect: (cb) => {
        connectCb = cb;
        return () => { connectCb = null; };
      },
      onDisconnect: (cb) => {
        disconnectCb = cb;
        return () => { disconnectCb = null; };
      },
      onRemoteScene: () => () => {},
      broadcastScene: () => {},
    };
    const { result, rerender } = renderHook((p: { active: boolean }) =>
      useWhiteboardRecorder(defaultProps(bag, { recordingActive: p.active, sync }))
    , { initialProps: { active: true } });

    // Need at least one event in the log so resume-trigger doesn't gate
    // the pause/sync markers — we drop one stroke first.
    bag.now = 300;
    act(() => {
      result.current.onCanvasChange([makeRect("r1", 0, 0)]);
    });
    act(() => { jest.advanceTimersByTime(120); });

    bag.now = 1000;
    act(() => { connectCb?.(); });
    bag.now = 2000;
    act(() => { disconnectCb?.(); });
    rerender({ active: true });

    const log = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    const types = log.events.map((e) => e.type);
    expect(types).toContain("sync-reconnect");
    expect(types).toContain("sync-disconnect");
  });

  test("resume-from-crash surfaces a checkpoint and acceptResume restores it", async () => {
    // Pre-populate IDB with a recoverable checkpoint for this exact session.
    await saveCheckpoint({
      kind: "whiteboard",
      ownerKey: whiteboardOwnerKey(ADMIN, STUDENT, SESSION),
      sessionId: SESSION,
      adminUserId: ADMIN,
      studentId: STUDENT,
      startedAt: "2026-04-23T09:30:00.000Z",
      schemaVersion: 1,
      payload: {
        log: {
          schemaVersion: 1,
          startedAt: "2026-04-23T09:30:00.000Z",
          durationMs: 12_000,
          events: [
            { t: 0, type: "snapshot", elements: [] },
            {
              t: 5_000,
              type: "add",
              element: {
                id: "rec-1",
                type: "rectangle",
                x: 0,
                y: 0,
                width: 50,
                height: 50,
              },
            },
          ],
        },
      },
    });

    const bag: Bag = { now: 0 };
    const { result } = renderHook(() => useWhiteboardRecorder(defaultProps(bag)));

    await act(async () => {
      await flushIDB();
    });

    expect(result.current.resumePrompt).not.toBeNull();
    expect(result.current.resumePrompt?.source).toBe("this-session");
    expect(result.current.resumePrompt?.durationMs).toBe(12_000);

    let restored: Awaited<ReturnType<typeof result.current.acceptResume>>;
    await act(async () => {
      restored = await result.current.acceptResume();
    });
    expect(restored!).not.toBeNull();
    expect(restored!.elements.length).toBe(1);
    expect(result.current.eventCount).toBe(2);
    expect(result.current.durationMs).toBe(12_000);
    expect(result.current.resumePrompt).toBeNull();
  });

  test("markPersisted clears the IDB checkpoint", async () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook((p: { active: boolean }) =>
      useWhiteboardRecorder(defaultProps(bag, { recordingActive: p.active }))
    , { initialProps: { active: false } });
    act(() => { rerender({ active: true }); });

    bag.now = 100;
    act(() => {
      result.current.onCanvasChange([makeRect("r1", 0, 0)]);
    });
    act(() => { jest.advanceTimersByTime(120); });

    // Trigger the 30s checkpoint loop, then drain microtasks for the
    // IDB save chain. Fake timers + microtasks need both kicks.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await flushIDB();
    });

    const found = await findCheckpoint(
      "whiteboard",
      whiteboardOwnerKey(ADMIN, STUDENT, SESSION)
    );
    expect(found).not.toBeNull();

    // Switch to real timers so the markPersisted IDB delete settles
    // without further timer-advancement gymnastics.
    jest.useRealTimers();
    await act(async () => {
      await result.current.markPersisted();
      await flushIDB();
    });

    const after = await findCheckpoint(
      "whiteboard",
      whiteboardOwnerKey(ADMIN, STUDENT, SESSION)
    );
    expect(after).toBeNull();
  });
});
