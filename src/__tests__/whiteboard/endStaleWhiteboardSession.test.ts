/**
 * @jest-environment node
 */

/**
 * Server-action contract for `endStaleWhiteboardSession`.
 *
 * This is the action invoked when the tutor clicks "End session" on
 * the Resume-or-End gate (Sarah's Apr 2026 pilot fix). It differs
 * from `endWhiteboardSession` in two important ways:
 *
 *   1. It does NOT require a final events.json blob URL. The tutor
 *      reopened a stale tab; the recorder hook never mounted in this
 *      load, so there's nothing to upload. The existing eventsBlobUrl
 *      (placeholder or whatever was last saved) is left intact for
 *      replay.
 *
 *   2. It MUST revoke every still-live join token in the same
 *      transaction so a stale student tab gets a 404 the next time
 *      it tries to reconnect. This is the whole point of the
 *      action — without it the student tab keeps "ghost-joining"
 *      the room.
 *
 * The contract this test pins:
 *   - assertOwnsWhiteboardSession is the multi-tenant gate.
 *   - Refuses to act on an already-ended session (idempotency: two
 *     tabs both clicking End must not race).
 *   - Stamps endedAt + computes durationSeconds from startedAt.
 *   - Revokes ALL active join tokens in the same transaction.
 *   - Does NOT touch eventsBlobUrl (key difference vs the regular
 *     end action).
 */

const txWhiteboardUpdateMock = jest.fn();
const txTokenUpdateManyMock = jest.fn();
const txWhiteboardFindUniqueMock = jest.fn();
const dbTransactionMock = jest.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    whiteboardSession: {
      findUnique: txWhiteboardFindUniqueMock,
      update: txWhiteboardUpdateMock,
    },
    whiteboardJoinToken: {
      updateMany: txTokenUpdateManyMock,
    },
  })
);

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    $transaction: (fn: (tx: unknown) => unknown) => dbTransactionMock(fn),
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) => assertOwnsWhiteboardSessionMock(id),
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

import { endStaleWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";

beforeEach(() => {
  txWhiteboardUpdateMock.mockReset();
  txTokenUpdateManyMock.mockReset();
  txWhiteboardFindUniqueMock.mockReset();
  dbTransactionMock.mockClear();
  assertOwnsWhiteboardSessionMock.mockReset();
  revalidatePathMock.mockReset();
});

function setupActiveSession(opts: { startedAtAgoMs?: number } = {}) {
  const startedAt = new Date(Date.now() - (opts.startedAtAgoMs ?? 30 * 60_000));
  assertOwnsWhiteboardSessionMock.mockResolvedValue({
    id: "wb_42",
    studentId: "stu_1",
    adminUserId: "admin_1",
    endedAt: null,
  });
  txWhiteboardFindUniqueMock.mockResolvedValue({ startedAt });
  txWhiteboardUpdateMock.mockImplementation(async (args: { data: { endedAt: Date } }) => ({
    id: "wb_42",
    endedAt: args.data.endedAt,
    durationSeconds: 1800,
  }));
  txTokenUpdateManyMock.mockResolvedValue({ count: 2 });
  return { startedAt };
}

describe("endStaleWhiteboardSession", () => {
  it("calls assertOwnsWhiteboardSession (multi-tenant gate)", async () => {
    setupActiveSession();

    await endStaleWhiteboardSession("wb_42");

    expect(assertOwnsWhiteboardSessionMock).toHaveBeenCalledWith("wb_42");
  });

  it("rejects if the session is already ended", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      id: "wb_42",
      studentId: "stu_1",
      adminUserId: "admin_1",
      endedAt: new Date("2026-04-24T11:00:00Z"),
    });

    await expect(endStaleWhiteboardSession("wb_42")).rejects.toThrow(
      /already ended/i
    );
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("stamps endedAt and computes durationSeconds from startedAt", async () => {
    setupActiveSession({ startedAtAgoMs: 45 * 60_000 });

    const result = await endStaleWhiteboardSession("wb_42");

    expect(txWhiteboardUpdateMock).toHaveBeenCalledTimes(1);
    const updateArgs = txWhiteboardUpdateMock.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "wb_42" });
    expect(updateArgs.data.endedAt).toBeInstanceOf(Date);
    expect(typeof updateArgs.data.durationSeconds).toBe("number");
    // ~45 min ± 1s slack for test timing.
    expect(updateArgs.data.durationSeconds).toBeGreaterThanOrEqual(45 * 60 - 2);
    expect(updateArgs.data.durationSeconds).toBeLessThanOrEqual(45 * 60 + 2);
    expect(result.durationSeconds).toBe(1800);
  });

  it("revokes ALL still-live join tokens in the same transaction", async () => {
    setupActiveSession();

    await endStaleWhiteboardSession("wb_42");

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txTokenUpdateManyMock).toHaveBeenCalledTimes(1);
    const tokenArgs = txTokenUpdateManyMock.mock.calls[0][0];
    expect(tokenArgs.where).toMatchObject({
      whiteboardSessionId: "wb_42",
      revokedAt: null,
    });
    expect(tokenArgs.data.revokedAt).toBeInstanceOf(Date);
  });

  it("does NOT touch eventsBlobUrl (key diff from endWhiteboardSession)", async () => {
    setupActiveSession();

    await endStaleWhiteboardSession("wb_42");

    const updateArgs = txWhiteboardUpdateMock.mock.calls[0][0];
    expect(updateArgs.data).not.toHaveProperty("eventsBlobUrl");
    expect(updateArgs.data).not.toHaveProperty("snapshotBlobUrl");
  });

  it("returns ISO endedAt + durationSeconds for the caller", async () => {
    setupActiveSession();

    const result = await endStaleWhiteboardSession("wb_42");

    expect(result.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof result.durationSeconds).toBe("number");
  });

  it("revalidates the student page + workspace so lists/tabs refresh", async () => {
    setupActiveSession();

    await endStaleWhiteboardSession("wb_42");

    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students/stu_1");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/students/stu_1/whiteboard/wb_42/workspace"
    );
  });
});
