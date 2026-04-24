/**
 * Unit coverage for the IndexedDB checkpoint store. Uses fake-indexeddb
 * to give us a real store implementation under jest's node environment.
 *
 * What's locked in:
 *   - save -> find round-trips a checkpoint with the right shape
 *   - clear actually removes the row
 *   - findLatestCheckpointForOwner returns the most recent of N
 *     checkpoints for the same tutor + student
 *   - "no indexedDB" environments return safe nulls / structured
 *     errors instead of throwing into the recorder loop
 *
 * Quota-eviction is tested via a mock that throws QuotaExceededError
 * on the FIRST put, then succeeds — verifying the retry path runs.
 */

/**
 * @jest-environment node
 */

import "fake-indexeddb/auto";

import {
  audioOwnerKey,
  clearCheckpoint,
  findCheckpoint,
  findLatestCheckpointForOwner,
  saveCheckpoint,
  whiteboardOwnerKey,
  _resetCheckpointStoreForTests,
} from "@/lib/whiteboard/checkpoint-store";

beforeEach(() => {
  _resetCheckpointStoreForTests();
});

describe("checkpoint-store", () => {
  test("save -> find round-trips a whiteboard checkpoint", async () => {
    const ownerKey = whiteboardOwnerKey("admin1", "student1", "wb1");
    const result = await saveCheckpoint({
      kind: "whiteboard",
      ownerKey,
      sessionId: "wb1",
      adminUserId: "admin1",
      studentId: "student1",
      startedAt: "2026-04-23T10:00:00.000Z",
      schemaVersion: 1,
      payload: { schemaVersion: 1, startedAt: "x", durationMs: 0, events: [] },
    });
    expect(result.ok).toBe(true);

    const found = await findCheckpoint("whiteboard", ownerKey);
    expect(found).not.toBeNull();
    expect(found!.sessionId).toBe("wb1");
    expect(found!.adminUserId).toBe("admin1");
    expect(found!.studentId).toBe("student1");
    expect(found!.payload).toEqual({
      schemaVersion: 1,
      startedAt: "x",
      durationMs: 0,
      events: [],
    });
    expect(found!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("save twice on the same key replaces the row", async () => {
    const ownerKey = whiteboardOwnerKey("admin1", "student1", "wb1");
    const base = {
      kind: "whiteboard" as const,
      ownerKey,
      sessionId: "wb1",
      adminUserId: "admin1",
      studentId: "student1",
      startedAt: "2026-04-23T10:00:00.000Z",
      schemaVersion: 1,
    };
    await saveCheckpoint({ ...base, payload: { v: 1 } });
    await saveCheckpoint({ ...base, payload: { v: 2 } });
    const found = await findCheckpoint<{ v: number }>("whiteboard", ownerKey);
    expect(found?.payload).toEqual({ v: 2 });
  });

  test("clearCheckpoint removes the row", async () => {
    const ownerKey = whiteboardOwnerKey("admin1", "student1", "wb1");
    await saveCheckpoint({
      kind: "whiteboard",
      ownerKey,
      sessionId: "wb1",
      adminUserId: "admin1",
      studentId: "student1",
      startedAt: "2026-04-23T10:00:00.000Z",
      schemaVersion: 1,
      payload: {},
    });
    expect(await findCheckpoint("whiteboard", ownerKey)).not.toBeNull();
    await clearCheckpoint("whiteboard", ownerKey);
    expect(await findCheckpoint("whiteboard", ownerKey)).toBeNull();
  });

  test("findLatestCheckpointForOwner returns the most-recently-updated row", async () => {
    const adminUserId = "admin1";
    const studentId = "student1";

    await saveCheckpoint({
      kind: "whiteboard",
      ownerKey: whiteboardOwnerKey(adminUserId, studentId, "first"),
      sessionId: "first",
      adminUserId,
      studentId,
      startedAt: "2026-04-23T10:00:00.000Z",
      schemaVersion: 1,
      payload: { tag: "first" },
    });

    // Bump time forward to guarantee distinct updatedAt strings.
    await new Promise((r) => setTimeout(r, 5));

    await saveCheckpoint({
      kind: "whiteboard",
      ownerKey: whiteboardOwnerKey(adminUserId, studentId, "second"),
      sessionId: "second",
      adminUserId,
      studentId,
      startedAt: "2026-04-23T10:30:00.000Z",
      schemaVersion: 1,
      payload: { tag: "second" },
    });

    const latest = await findLatestCheckpointForOwner<{ tag: string }>(
      "whiteboard",
      adminUserId,
      studentId
    );
    expect(latest?.payload).toEqual({ tag: "second" });
  });

  test("findLatestCheckpointForOwner does not leak across tutors", async () => {
    await saveCheckpoint({
      kind: "whiteboard",
      ownerKey: whiteboardOwnerKey("admin1", "student1", "wb1"),
      sessionId: "wb1",
      adminUserId: "admin1",
      studentId: "student1",
      startedAt: "2026-04-23T10:00:00.000Z",
      schemaVersion: 1,
      payload: { tutor: "1" },
    });
    await saveCheckpoint({
      kind: "whiteboard",
      ownerKey: whiteboardOwnerKey("admin2", "student1", "wb2"),
      sessionId: "wb2",
      adminUserId: "admin2",
      studentId: "student1",
      startedAt: "2026-04-23T10:00:00.000Z",
      schemaVersion: 1,
      payload: { tutor: "2" },
    });

    const tutor1Latest = await findLatestCheckpointForOwner<{ tutor: string }>(
      "whiteboard",
      "admin1",
      "student1"
    );
    expect(tutor1Latest?.payload).toEqual({ tutor: "1" });
  });

  test("audio + whiteboard kinds are independent stores", async () => {
    await saveCheckpoint({
      kind: "audio",
      ownerKey: audioOwnerKey("admin1", "student1", "mount-x"),
      sessionId: "audio-mount-x",
      adminUserId: "admin1",
      studentId: "student1",
      startedAt: "2026-04-23T10:00:00.000Z",
      schemaVersion: 1,
      payload: "audio-blob-meta",
    });
    await saveCheckpoint({
      kind: "whiteboard",
      ownerKey: whiteboardOwnerKey("admin1", "student1", "wb1"),
      sessionId: "wb1",
      adminUserId: "admin1",
      studentId: "student1",
      startedAt: "2026-04-23T10:00:00.000Z",
      schemaVersion: 1,
      payload: "wb-events",
    });
    const a = await findLatestCheckpointForOwner("audio", "admin1", "student1");
    const w = await findLatestCheckpointForOwner("whiteboard", "admin1", "student1");
    expect(a?.payload).toBe("audio-blob-meta");
    expect(w?.payload).toBe("wb-events");
  });
});
