/**
 * @jest-environment node
 */

/**
 * Server-action contract for `endWhiteboardSession` (Phase 1b — Pillar 3).
 *
 * This is the atomic finalization path the End-session button calls.
 * It MUST do all of the following inside a single `db.$transaction`,
 * or none of them — leaving the row half-ended would leak join
 * tokens (live student tab keeps trying to reconnect) AND would
 * orphan the events.json blob URL.
 *
 *   1. Stamp `endedAt` + compute `durationSeconds`.
 *   2. Swap the placeholder `eventsBlobUrl` for the final one.
 *   3. Register every passed audio segment as a `SessionRecording`
 *      row, deduped by `(whiteboardSessionId, blobUrl)`. Order assigned
 *      deterministically by `(audioStartedAtMs ASC, streamId ASC)` so
 *      a retried call produces stable orderIndex values.
 *   4. Revoke every still-live join token.
 *
 * This test pins the contract for both the events-only path
 * (segments empty — same as Phase 0c) and the multi-track path
 * (Phase 1b new behaviour).
 */

const txWhiteboardUpdateMock = jest.fn();
const txWhiteboardFindUniqueMock = jest.fn();
const txTokenUpdateManyMock = jest.fn();
const txSessionParticipantUpdateManyMock = jest.fn();
const txSessionRecordingFindManyMock = jest.fn();
const txSessionRecordingAggregateMock = jest.fn();
const txSessionRecordingCreateManyMock = jest.fn();
const dbWhiteboardFindUniqueMock = jest.fn();
const dbAdminUserFindUniqueMock = jest.fn();
const dbTransactionMock = jest.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    whiteboardSession: {
      findUnique: txWhiteboardFindUniqueMock,
      update: txWhiteboardUpdateMock,
    },
    whiteboardJoinToken: {
      updateMany: txTokenUpdateManyMock,
    },
    sessionParticipant: {
      updateMany: txSessionParticipantUpdateManyMock,
    },
    sessionRecording: {
      findMany: txSessionRecordingFindManyMock,
      aggregate: txSessionRecordingAggregateMock,
      createMany: txSessionRecordingCreateManyMock,
    },
  })
);

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardSession: {
      findUnique: (...args: unknown[]) => dbWhiteboardFindUniqueMock(...args),
    },
    adminUser: {
      findUnique: (...args: unknown[]) => dbAdminUserFindUniqueMock(...args),
    },
    // assertEffectiveConsent (now unconditional) reads sessionConsentSnapshot.
    // Default null → no-snapshot fallback (consent granted for unclaimed sessions).
    sessionConsentSnapshot: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: (fn: (tx: unknown) => unknown) => dbTransactionMock(fn),
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) => assertOwnsWhiteboardSessionMock(id),
}));

const shouldShortCircuitEndSessionForErasureMock = jest.fn();
jest.mock("@/lib/erasure/assert-student-not-erased", () => ({
  __esModule: true,
  shouldShortCircuitEndSessionForErasure: (studentId: string) =>
    shouldShortCircuitEndSessionForErasureMock(studentId),
}));

jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "rid_test",
}));

const revalidatePathMock = jest.fn();
jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

jest.mock("@/lib/billing/freeze-at-close", () => {
  const actual = jest.requireActual<typeof import("@/lib/billing/freeze-at-close")>(
    "@/lib/billing/freeze-at-close"
  );
  return {
    __esModule: true,
    computeBillingFreezeFields: jest.fn(actual.computeBillingFreezeFields),
  };
});

const mockLogProductEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/observability/product-events", () => ({
  __esModule: true,
  logProductEvent: (...args: unknown[]) => mockLogProductEvent(...args),
}));

import {
  endWhiteboardSession,
  type EndSessionSegment,
} from "@/app/admin/students/[id]/whiteboard/actions";
import { computeBillingFreezeFields } from "@/lib/billing/freeze-at-close";

const computeBillingFreezeFieldsMock =
  computeBillingFreezeFields as jest.MockedFunction<
    typeof computeBillingFreezeFields
  >;

const FINAL_EVENTS_URL =
  "https://abc.blob.vercel-storage.com/whiteboard-sessions/admin_1/stu_1/123-events.json";
const SEG_BASE_URL = "https://abc.blob.vercel-storage.com/whiteboard-audio";

function makeSegment(overrides: Partial<EndSessionSegment> = {}): EndSessionSegment {
  return {
    blobUrl: `${SEG_BASE_URL}/seg-default-${Math.random().toString(36).slice(2, 8)}.webm`,
    mimeType: "audio/webm",
    sizeBytes: 1024,
    audioStartedAtMs: 1_700_000_000_000,
    streamId: "tutor:mic",
    segmentId: "seg-default",
    ...overrides,
  };
}

function setupActiveSession(
  opts: {
    startedAtAgoMs?: number;
    billing?: Partial<{
      sessionMode: "LIVE" | "IN_PERSON";
      activeMs: number;
      lastActiveAt: Date | null;
      bothConnectedAt: Date | null;
      activatedAt: Date | null;
      roundingIncrementMin: number | null;
      roundingMode: string | null;
      tutorTimezone: string | null;
      billedDurationMin: number | null;
    }>;
  } = {}
) {
  const startedAt = new Date(Date.now() - (opts.startedAtAgoMs ?? 30 * 60_000));
  const activatedAt = new Date(startedAt.getTime() + 5 * 60_000);
  const billing = opts.billing ?? {};
  assertOwnsWhiteboardSessionMock.mockResolvedValue({
    id: "wb_42",
    studentId: "stu_1",
    adminUserId: "admin_1",
    endedAt: null,
    eventsBlobUrl: "placeholder",
    consentAcknowledged: true,
  });
  dbWhiteboardFindUniqueMock.mockResolvedValue({ sessionPhase: "ACTIVE" });
  dbAdminUserFindUniqueMock.mockResolvedValue({ tutorTimezone: "America/Denver" });
  txWhiteboardFindUniqueMock.mockResolvedValue({
    startedAt,
    activatedAt: billing.activatedAt ?? activatedAt,
    sessionMode: billing.sessionMode ?? "LIVE",
    activeMs: billing.activeMs ?? 0,
    lastActiveAt: billing.lastActiveAt ?? null,
    bothConnectedAt: billing.bothConnectedAt ?? null,
    roundingIncrementMin: billing.roundingIncrementMin ?? 5,
    roundingMode: billing.roundingMode ?? "nearest",
    tutorTimezone: billing.tutorTimezone ?? null,
    billedDurationMin: billing.billedDurationMin ?? null,
  });
  txWhiteboardUpdateMock.mockImplementation(
    async (args: { data: { endedAt: Date } }) => ({
      id: "wb_42",
      endedAt: args.data.endedAt,
      durationSeconds: 1800,
    })
  );
  txTokenUpdateManyMock.mockResolvedValue({ count: 2 });
  txSessionParticipantUpdateManyMock.mockResolvedValue({ count: 1 });
  txSessionRecordingFindManyMock.mockResolvedValue([]);
  txSessionRecordingAggregateMock.mockResolvedValue({ _max: { orderIndex: null } });
  txSessionRecordingCreateManyMock.mockResolvedValue({ count: 0 });
  return { startedAt };
}

beforeEach(() => {
  mockLogProductEvent.mockReset();
  txWhiteboardUpdateMock.mockReset();
  txWhiteboardFindUniqueMock.mockReset();
  txTokenUpdateManyMock.mockReset();
  txSessionParticipantUpdateManyMock.mockReset();
  txSessionRecordingFindManyMock.mockReset();
  txSessionRecordingAggregateMock.mockReset();
  txSessionRecordingCreateManyMock.mockReset();
  dbWhiteboardFindUniqueMock.mockReset();
  dbAdminUserFindUniqueMock.mockReset();
  dbTransactionMock.mockClear();
  assertOwnsWhiteboardSessionMock.mockReset();
  revalidatePathMock.mockReset();
  shouldShortCircuitEndSessionForErasureMock.mockReset();
  shouldShortCircuitEndSessionForErasureMock.mockResolvedValue(false);
  computeBillingFreezeFieldsMock.mockImplementation(
    jest.requireActual<typeof import("@/lib/billing/freeze-at-close")>(
      "@/lib/billing/freeze-at-close"
    ).computeBillingFreezeFields
  );
});

describe("endWhiteboardSession — events-only end (no segments)", () => {
  it("stamps endedAt, swaps eventsBlobUrl, revokes tokens, all in one transaction", async () => {
    setupActiveSession();

    const result = await endWhiteboardSession("wb_42", FINAL_EVENTS_URL);

    expect(assertOwnsWhiteboardSessionMock).toHaveBeenCalledWith("wb_42");
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txWhiteboardUpdateMock).toHaveBeenCalledTimes(1);
    const updateArgs = txWhiteboardUpdateMock.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "wb_42" });
    expect(updateArgs.data.endedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.eventsBlobUrl).toBe(FINAL_EVENTS_URL);
    expect(txTokenUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { whiteboardSessionId: "wb_42", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      })
    );
    expect(txSessionParticipantUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { whiteboardSessionId: "wb_42", leftAt: null },
        data: { leftAt: expect.any(Date) },
      })
    );
    expect(txSessionRecordingCreateManyMock).not.toHaveBeenCalled();
    expect(result.registeredSegments).toBe(0);
    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "SESSION_ENDED",
      adminUserId: "admin_1",
      studentId: "stu_1",
      whiteboardSessionId: "wb_42",
      metadata: {
        priorPhase: "ACTIVE",
        path: "normal",
      },
    });
  });

  it("rejects an already-ended session", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      id: "wb_42",
      studentId: "stu_1",
      adminUserId: "admin_1",
      endedAt: new Date("2026-04-24T11:00:00Z"),
      eventsBlobUrl: "placeholder",
      consentAcknowledged: true,
    });

    await expect(
      endWhiteboardSession("wb_42", FINAL_EVENTS_URL)
    ).rejects.toThrow(/already ended/i);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});

describe("endWhiteboardSession — single-stream multi-segment payload", () => {
  it("creates SessionRecording rows for each new segment in audioStartedAtMs order", async () => {
    setupActiveSession();
    const segments: EndSessionSegment[] = [
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/seg-2.webm`,
        audioStartedAtMs: 200,
        segmentId: "seg-2",
      }),
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/seg-1.webm`,
        audioStartedAtMs: 100,
        segmentId: "seg-1",
      }),
    ];

    const result = await endWhiteboardSession("wb_42", FINAL_EVENTS_URL, {
      segments,
    });

    expect(txSessionRecordingCreateManyMock).toHaveBeenCalledTimes(1);
    const createArgs = txSessionRecordingCreateManyMock.mock.calls[0][0];
    expect(createArgs.data).toHaveLength(2);
    expect(createArgs.skipDuplicates).toBe(true);
    expect(createArgs.data[0].blobUrl).toBe(`${SEG_BASE_URL}/seg-1.webm`);
    expect(createArgs.data[0].orderIndex).toBe(0);
    expect(createArgs.data[1].blobUrl).toBe(`${SEG_BASE_URL}/seg-2.webm`);
    expect(createArgs.data[1].orderIndex).toBe(1);
    expect(createArgs.data[0].streamId).toBe("tutor:mic");
    expect(createArgs.data[0].adminUserId).toBe("admin_1");
    expect(createArgs.data[0].studentId).toBe("stu_1");
    expect(result.registeredSegments).toBe(2);
  });

  it("dedupes against existing SessionRecording rows by blobUrl", async () => {
    setupActiveSession();
    txSessionRecordingFindManyMock.mockResolvedValue([
      { blobUrl: `${SEG_BASE_URL}/seg-1.webm`, orderIndex: 0 },
    ]);
    txSessionRecordingAggregateMock.mockResolvedValue({
      _max: { orderIndex: 0 },
    });
    const segments: EndSessionSegment[] = [
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/seg-1.webm`,
        audioStartedAtMs: 100,
        segmentId: "seg-1",
      }),
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/seg-2.webm`,
        audioStartedAtMs: 200,
        segmentId: "seg-2",
      }),
    ];

    const result = await endWhiteboardSession("wb_42", FINAL_EVENTS_URL, {
      segments,
    });

    const createArgs = txSessionRecordingCreateManyMock.mock.calls[0][0];
    expect(createArgs.data).toHaveLength(1);
    expect(createArgs.data[0].blobUrl).toBe(`${SEG_BASE_URL}/seg-2.webm`);
    expect(createArgs.data[0].orderIndex).toBe(1); // starts after existing max
    expect(result.registeredSegments).toBe(1);
  });
});

describe("endWhiteboardSession — multi-stream payload (tutor + student)", () => {
  it("preserves per-stream streamId on insert and tie-breaks on streamId for equal timestamps", async () => {
    setupActiveSession();
    const segments: EndSessionSegment[] = [
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/tutor-1.webm`,
        audioStartedAtMs: 1_000,
        streamId: "tutor:mic",
        segmentId: "tutor-1",
      }),
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/student-1.webm`,
        audioStartedAtMs: 1_000,
        streamId: "student:peer-abc:mic",
        segmentId: "student-1",
      }),
    ];

    await endWhiteboardSession("wb_42", FINAL_EVENTS_URL, { segments });

    const createArgs = txSessionRecordingCreateManyMock.mock.calls[0][0];
    expect(createArgs.data).toHaveLength(2);
    // tie-break: streamId ASC — "student:..." sorts before "tutor:..."
    expect(createArgs.data[0].streamId).toBe("student:peer-abc:mic");
    expect(createArgs.data[1].streamId).toBe("tutor:mic");
    // orderIndex still deterministic
    expect(createArgs.data[0].orderIndex).toBe(0);
    expect(createArgs.data[1].orderIndex).toBe(1);
  });

  it("handles mixed timeline: tutor at 100ms, student at 50ms, tutor at 200ms", async () => {
    setupActiveSession();
    const segments: EndSessionSegment[] = [
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/tutor-a.webm`,
        audioStartedAtMs: 100,
        streamId: "tutor:mic",
        segmentId: "tutor-a",
      }),
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/student-a.webm`,
        audioStartedAtMs: 50,
        streamId: "student:peer-1:mic",
        segmentId: "student-a",
      }),
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/tutor-b.webm`,
        audioStartedAtMs: 200,
        streamId: "tutor:mic",
        segmentId: "tutor-b",
      }),
    ];

    await endWhiteboardSession("wb_42", FINAL_EVENTS_URL, { segments });

    const createArgs = txSessionRecordingCreateManyMock.mock.calls[0][0];
    expect(createArgs.data.map((d: { blobUrl: string }) => d.blobUrl)).toEqual([
      `${SEG_BASE_URL}/student-a.webm`,
      `${SEG_BASE_URL}/tutor-a.webm`,
      `${SEG_BASE_URL}/tutor-b.webm`,
    ]);
  });
});

describe("endWhiteboardSession — payload validation", () => {
  it("rejects a segment with a blobUrl outside the Vercel Blob namespace", async () => {
    setupActiveSession();
    const segments: EndSessionSegment[] = [
      makeSegment({
        blobUrl: "https://attacker.example.com/seg.webm",
        segmentId: "bad",
      }),
    ];

    await expect(
      endWhiteboardSession("wb_42", FINAL_EVENTS_URL, { segments })
    ).rejects.toThrow(/whiteboard Blob namespace/i);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects a segment with empty streamId", async () => {
    setupActiveSession();
    const segments: EndSessionSegment[] = [makeSegment({ streamId: "" })];

    await expect(
      endWhiteboardSession("wb_42", FINAL_EVENTS_URL, { segments })
    ).rejects.toThrow(/empty streamId/i);
  });

  it("rejects a segment with negative sizeBytes", async () => {
    setupActiveSession();
    const segments: EndSessionSegment[] = [makeSegment({ sizeBytes: -1 })];

    await expect(
      endWhiteboardSession("wb_42", FINAL_EVENTS_URL, { segments })
    ).rejects.toThrow(/invalid sizeBytes/i);
  });

  it("rejects a non-finite audioStartedAtMs", async () => {
    setupActiveSession();
    const segments: EndSessionSegment[] = [
      makeSegment({ audioStartedAtMs: NaN }),
    ];

    await expect(
      endWhiteboardSession("wb_42", FINAL_EVENTS_URL, { segments })
    ).rejects.toThrow(/audioStartedAtMs/i);
  });
});

describe("endWhiteboardSession — erasure short-circuit (E6 / H-2)", () => {
  it("skips segment registration and content blob swap when erasure short-circuits", async () => {
    setupActiveSession();
    shouldShortCircuitEndSessionForErasureMock.mockResolvedValue(true);
    const segments: EndSessionSegment[] = [
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/seg-1.webm`,
        audioStartedAtMs: 100,
        segmentId: "seg-1",
      }),
    ];
    const snapshotUrl =
      "https://abc.blob.vercel-storage.com/whiteboard-snapshots/snap.png";

    const result = await endWhiteboardSession("wb_42", FINAL_EVENTS_URL, {
      segments,
      snapshotBlobUrl: snapshotUrl,
    });

    expect(shouldShortCircuitEndSessionForErasureMock).toHaveBeenCalledWith(
      "stu_1"
    );
    expect(txSessionRecordingCreateManyMock).not.toHaveBeenCalled();
    expect(result.registeredSegments).toBe(0);

    const updateArgs = txWhiteboardUpdateMock.mock.calls[0][0];
    expect(updateArgs.data.endedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.eventsBlobUrl).toBe("placeholder");
    expect(updateArgs.data.snapshotBlobUrl).toBeUndefined();
    expect(txTokenUpdateManyMock).toHaveBeenCalled();
  });

  it("registers segments and swaps eventsBlobUrl when erasure short-circuit is false", async () => {
    setupActiveSession();
    shouldShortCircuitEndSessionForErasureMock.mockResolvedValue(false);
    const segments: EndSessionSegment[] = [
      makeSegment({
        blobUrl: `${SEG_BASE_URL}/seg-ok.webm`,
        audioStartedAtMs: 100,
        segmentId: "seg-ok",
      }),
    ];

    const result = await endWhiteboardSession("wb_42", FINAL_EVENTS_URL, {
      segments,
    });

    expect(txSessionRecordingCreateManyMock).toHaveBeenCalledTimes(1);
    expect(result.registeredSegments).toBe(1);
    const updateArgs = txWhiteboardUpdateMock.mock.calls[0][0];
    expect(updateArgs.data.eventsBlobUrl).toBe(FINAL_EVENTS_URL);
  });
});

describe("endWhiteboardSession — idempotency safeguards", () => {
  it("a second call with the same payload re-detects existing rows and inserts nothing new", async () => {
    setupActiveSession();
    // Simulate "all segments already saved" by returning them from findMany.
    const seg1 = `${SEG_BASE_URL}/dup-1.webm`;
    const seg2 = `${SEG_BASE_URL}/dup-2.webm`;
    txSessionRecordingFindManyMock.mockResolvedValue([
      { blobUrl: seg1, orderIndex: 0 },
      { blobUrl: seg2, orderIndex: 1 },
    ]);
    txSessionRecordingAggregateMock.mockResolvedValue({
      _max: { orderIndex: 1 },
    });
    const segments: EndSessionSegment[] = [
      makeSegment({ blobUrl: seg1, segmentId: "d1", audioStartedAtMs: 100 }),
      makeSegment({ blobUrl: seg2, segmentId: "d2", audioStartedAtMs: 200 }),
    ];

    const result = await endWhiteboardSession("wb_42", FINAL_EVENTS_URL, {
      segments,
    });

    expect(txSessionRecordingCreateManyMock).not.toHaveBeenCalled();
    expect(result.registeredSegments).toBe(0);
  });
});

describe("endWhiteboardSession — WS-J billing freeze", () => {
  it("freezes billed* fields from LIVE activeMs in the close transaction", async () => {
    const bothConnectedAt = new Date(Date.now() - 50 * 60_000);
    setupActiveSession({
      billing: {
        sessionMode: "LIVE",
        activeMs: 55 * 60_000,
        bothConnectedAt,
        roundingIncrementMin: 5,
        roundingMode: "nearest",
      },
    });

    await endWhiteboardSession("wb_42", FINAL_EVENTS_URL);

    const updateArgs = txWhiteboardUpdateMock.mock.calls[0][0];
    expect(updateArgs.data.billedDurationMin).toBe(55);
    expect(updateArgs.data.billedStartLocal).toEqual(expect.any(String));
    expect(updateArgs.data.billedEndLocal).toEqual(expect.any(String));
    expect(updateArgs.data.sessionDateLocal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(updateArgs.data.tutorTimezone).toBe("America/Denver");
    expect(updateArgs.data.activeMs).toBeUndefined();
  });

  it("IN_PERSON uses ACTIVE-phase elapsed when activeMs is ~0", async () => {
    setupActiveSession({
      startedAtAgoMs: 40 * 60_000,
      billing: {
        sessionMode: "IN_PERSON",
        activeMs: 0,
        bothConnectedAt: null,
        roundingIncrementMin: 5,
        roundingMode: "nearest",
      },
    });

    await endWhiteboardSession("wb_42", FINAL_EVENTS_URL);

    const updateArgs = txWhiteboardUpdateMock.mock.calls[0][0];
    expect(updateArgs.data.billedDurationMin).toBeGreaterThan(0);
    expect(updateArgs.data.activeMs).toBeUndefined();
  });

  it("skips billing recompute when billedDurationMin is already set", async () => {
    setupActiveSession({
      billing: {
        billedDurationMin: 60,
        sessionMode: "LIVE",
        activeMs: 10 * 60_000,
        bothConnectedAt: new Date(),
      },
    });

    await endWhiteboardSession("wb_42", FINAL_EVENTS_URL);

    const updateArgs = txWhiteboardUpdateMock.mock.calls[0][0];
    expect(updateArgs.data.billedDurationMin).toBeUndefined();
    expect(updateArgs.data.billedStartLocal).toBeUndefined();
  });

  it("finalizes when billing freeze throws (billing failure is non-fatal)", async () => {
    setupActiveSession({
      billing: {
        sessionMode: "LIVE",
        activeMs: 30 * 60_000,
        bothConnectedAt: new Date(Date.now() - 35 * 60_000),
      },
    });
    computeBillingFreezeFieldsMock.mockImplementation(() => {
      throw new RangeError("Invalid time zone specified: Not/AZone");
    });

    await expect(
      endWhiteboardSession("wb_42", FINAL_EVENTS_URL)
    ).resolves.toBeDefined();

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    const updateArgs = txWhiteboardUpdateMock.mock.calls[0][0];
    expect(updateArgs.data.endedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.billedDurationMin).toBeUndefined();
    expect(updateArgs.data.billedStartLocal).toBeUndefined();
    expect(txTokenUpdateManyMock).toHaveBeenCalled();
  });
});
