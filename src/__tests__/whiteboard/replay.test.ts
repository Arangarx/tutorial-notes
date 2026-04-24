/**
 * Coverage for `parseEventLogBySchema` and the `reconstructSceneAt`
 * integration the WhiteboardReplay component depends on.
 *
 * The full React component is wired through `next/dynamic` and pulls
 * Excalidraw + audio elements that don't run cleanly in jsdom; the
 * unit slice we cover here is the data-layer machinery the player
 * sits on. The Playwright suite (phase1-tests) exercises the player
 * end-to-end.
 */

import { parseEventLogBySchema } from "@/components/whiteboard/WhiteboardReplay";
import {
  WB_EVENT_LOG_SCHEMA_VERSION,
  reconstructSceneAt,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";

describe("parseEventLogBySchema", () => {
  it("accepts a valid v1 log unchanged", () => {
    const log: WBEventLog = {
      schemaVersion: WB_EVENT_LOG_SCHEMA_VERSION,
      startedAt: "2026-04-23T18:00:00Z",
      durationMs: 12_000,
      events: [],
    };
    const out = parseEventLogBySchema(log);
    expect(out).toBe(log);
  });

  it("rejects an unknown future schemaVersion (no silent misreplay)", () => {
    expect(() =>
      parseEventLogBySchema({
        schemaVersion: 99,
        startedAt: "2026-04-23T18:00:00Z",
        durationMs: 0,
        events: [],
      })
    ).toThrow(/Unsupported whiteboard events schemaVersion: 99/);
  });

  it("rejects logs with non-numeric schemaVersion (defensive)", () => {
    expect(() =>
      parseEventLogBySchema({
        schemaVersion: "1",
        startedAt: "2026-04-23T18:00:00Z",
        durationMs: 0,
        events: [],
      })
    ).toThrow(/Unsupported whiteboard events schemaVersion/);
  });

  it("rejects v1 logs missing top-level fields", () => {
    expect(() =>
      parseEventLogBySchema({
        schemaVersion: 1,
        durationMs: 0,
        events: [],
      })
    ).toThrow(/startedAt/);
    expect(() =>
      parseEventLogBySchema({
        schemaVersion: 1,
        startedAt: "x",
        events: [],
      })
    ).toThrow(/durationMs/);
    expect(() =>
      parseEventLogBySchema({
        schemaVersion: 1,
        startedAt: "x",
        durationMs: 0,
      })
    ).toThrow(/events.*array/);
  });
});

describe("reconstructSceneAt timeline behavior (replay player contract)", () => {
  // Build a small diff log that mirrors what the recorder actually
  // emits: snapshot(empty) at t=0, then a few adds + an update + a
  // remove. The replay player's core invariant is that calling
  // reconstructSceneAt with monotonically increasing T values gives
  // scenes that are consistent with what the user saw mid-session.

  const log: WBEventLog = {
    schemaVersion: 1,
    startedAt: "2026-04-23T18:00:00Z",
    durationMs: 5_000,
    events: [
      { t: 0, type: "snapshot", elements: [] },
      {
        t: 1000,
        type: "add",
        element: {
          id: "a",
          type: "freehand",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          strokeColor: "#000",
          clientId: "tutor",
        },
      },
      {
        t: 2000,
        type: "add",
        element: {
          id: "b",
          type: "freehand",
          x: 200,
          y: 200,
          width: 30,
          height: 30,
          strokeColor: "#000",
          clientId: "student",
        },
      },
      {
        t: 3000,
        type: "update",
        elementId: "a",
        patch: { x: 10, width: 110 },
      },
      { t: 4000, type: "remove", elementId: "b" },
    ],
  };

  it("scene at t=0 is empty", () => {
    expect(reconstructSceneAt(log, 0).size).toBe(0);
  });

  it("scene at t=1500 has the tutor stroke only", () => {
    const scene = reconstructSceneAt(log, 1500);
    expect(scene.size).toBe(1);
    const a = scene.get("a")!;
    expect(a.x).toBe(0);
    expect(a.width).toBe(100);
  });

  it("scene at t=2500 has both strokes", () => {
    const scene = reconstructSceneAt(log, 2500);
    expect(scene.size).toBe(2);
  });

  it("scene at t=3500 reflects the update patch", () => {
    const scene = reconstructSceneAt(log, 3500);
    expect(scene.get("a")!.x).toBe(10);
    expect(scene.get("a")!.width).toBe(110);
  });

  it("scene at t=4500 has the student stroke removed", () => {
    const scene = reconstructSceneAt(log, 4500);
    expect(scene.size).toBe(1);
    expect(scene.has("a")).toBe(true);
    expect(scene.has("b")).toBe(false);
  });

  it("scene at t=∞ matches the final-state expectation", () => {
    // Calling at a time past durationMs should still work and give
    // the post-final-event scene (caller uses this for the final-
    // snapshot view when the audio has ended).
    const scene = reconstructSceneAt(log, Number.MAX_SAFE_INTEGER);
    expect(scene.size).toBe(1);
    expect(scene.get("a")!.x).toBe(10);
  });
});
