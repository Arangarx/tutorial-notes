/**
 * @jest-environment node
 *
 * GET /api/whiteboard/[sessionId]/session-ended
 *   → { ended: boolean }
 *
 * Used by useWhiteboardRecorder to drop stale IndexedDB checkpoints
 * when the server session is already finished.
 */

const assertOwnsMock = jest.fn();

jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) => assertOwnsMock(id),
}));

import { GET } from "@/app/api/whiteboard/[sessionId]/session-ended/route";

function makeCtx(sessionId = "wb_42") {
  return {
    req: new Request(
      `http://localhost/api/whiteboard/${sessionId}/session-ended`
    ),
    ctx: { params: Promise.resolve({ sessionId }) },
  };
}

beforeEach(() => {
  assertOwnsMock.mockReset();
});

describe("GET /api/whiteboard/[sessionId]/session-ended", () => {
  it("returns { ended: true } when the session has endedAt set", async () => {
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      studentId: "stu_1",
      adminUserId: "adm_1",
      eventsBlobUrl: "https://x",
      endedAt: new Date("2026-04-24T20:00:00Z"),
    });
    const { req, ctx } = makeCtx();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ended: boolean };
    expect(body.ended).toBe(true);
  });

  it("returns { ended: false } when the session is still open", async () => {
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      studentId: "stu_1",
      adminUserId: "adm_1",
      eventsBlobUrl: "https://x",
      endedAt: null,
    });
    const { req, ctx } = makeCtx();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ended: boolean };
    expect(body.ended).toBe(false);
  });

  it("calls assertOwnsWhiteboardSession (multi-tenant gate)", async () => {
    assertOwnsMock.mockResolvedValue({
      id: "wb_99",
      endedAt: null,
    });
    const { req, ctx } = makeCtx("wb_99");
    await GET(req, ctx);
    expect(assertOwnsMock).toHaveBeenCalledWith("wb_99");
  });
});
