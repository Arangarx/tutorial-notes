/**
 * Route-handler tests for `/api/whiteboard/[sessionId]/events`.
 *
 * Sarah-pilot regression context (Apr 24 2026): a session in the
 * read-only review surface displayed the raw error
 *
 *     Could not load whiteboard recording: Unexpected token '<',
 *     "<!DOCTYPE "... is not valid JSON
 *
 * to the tutor. Root cause was a Vercel Blob fetch returning a 200
 * HTML body (token misconfig / stale URL), which this proxy passed
 * through with `Content-Type: application/json`. The player then
 * choked on the parse and surfaced the JS error message directly.
 *
 * This suite locks the contract that prevents that regression:
 *
 *   - 404 when the session has no eventsBlobUrl on the row.
 *   - 502 when the blob fetch returns a non-2xx response.
 *   - 502 when the blob fetch returns 2xx but with a non-JSON
 *     content type (the actual Sarah repro). The body is a clean
 *     `{ error: string }` so the player can surface it in copy.
 *   - 200 + streamed bytes on the happy path.
 *   - assertOwnsWhiteboardSession is the multi-tenant gate.
 *
 * Anyone changing the proxy must keep these contracts intact OR
 * update the player (and its own tests) at the same time.
 */

const assertOwnsMock = jest.fn();

jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) => assertOwnsMock(id),
}));

jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "rid_test",
}));

import { GET } from "@/app/api/whiteboard/[sessionId]/events/route";

function makeCtx(sessionId = "wb_42") {
  return {
    req: new Request(`http://localhost/api/whiteboard/${sessionId}/events`),
    ctx: { params: Promise.resolve({ sessionId }) },
  };
}

const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  assertOwnsMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.BLOB_READ_WRITE_TOKEN = "test_token";
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("GET /api/whiteboard/[sessionId]/events", () => {
  it("calls assertOwnsWhiteboardSession (multi-tenant gate)", async () => {
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      eventsBlobUrl: "https://blob/events.json",
      endedAt: new Date(),
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ schemaVersion: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const { req, ctx } = makeCtx();

    await GET(req, ctx);

    expect(assertOwnsMock).toHaveBeenCalledWith("wb_42");
  });

  it("returns 404 when the session row has no eventsBlobUrl", async () => {
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      eventsBlobUrl: null,
      endedAt: null,
    });

    const { req, ctx } = makeCtx();
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/no event log/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 with clean JSON when the blob fetch is non-2xx", async () => {
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      eventsBlobUrl: "https://blob/events.json",
      endedAt: null,
    });
    fetchMock.mockResolvedValue(
      new Response("not found", { status: 404 })
    );

    const { req, ctx } = makeCtx();
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unavailable/i);
  });

  it("returns 502 with clean JSON when blob returns 2xx HTML (Sarah repro)", async () => {
    // This is the EXACT scenario from the Apr 24 screenshot: blob
    // came back 200 OK but with an HTML body (Vercel Blob auth /
    // token misconfig surface). The proxy MUST NOT stream that body
    // through with Content-Type: application/json — the player would
    // then JSON.parse `<!DOCTYPE` and surface the raw JS error.
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      eventsBlobUrl: "https://blob/events.json",
      endedAt: new Date(),
    });
    fetchMock.mockResolvedValue(
      new Response("<!DOCTYPE html><html><body>nope</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const { req, ctx } = makeCtx();
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unexpected format|cannot be replayed/i);
  });

  it("rejects 2xx with no Content-Type at all (defensive)", async () => {
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      eventsBlobUrl: "https://blob/events.json",
      endedAt: null,
    });
    fetchMock.mockResolvedValue(
      new Response("garbage", { status: 200, headers: {} })
    );

    const { req, ctx } = makeCtx();
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
  });

  it("happy path: streams 200 with application/json on a real JSON blob", async () => {
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      eventsBlobUrl: "https://blob/events.json",
      endedAt: new Date(),
    });
    const upstream = JSON.stringify({
      schemaVersion: 1,
      startedAt: "2026-04-24T10:00:00Z",
      durationMs: 1234,
      events: [],
    });
    fetchMock.mockResolvedValue(
      new Response(upstream, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { req, ctx } = makeCtx();
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    const body = await res.text();
    expect(body).toContain('"schemaVersion":1');
  });

  it("happy path: matching content-type with charset still works", async () => {
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      eventsBlobUrl: "https://blob/events.json",
      endedAt: null,
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ schemaVersion: 1, events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      })
    );

    const { req, ctx } = makeCtx();
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
  });

  it("forwards the BLOB_READ_WRITE_TOKEN to the upstream fetch", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "secret_xyz";
    assertOwnsMock.mockResolvedValue({
      id: "wb_42",
      eventsBlobUrl: "https://blob/events.json",
      endedAt: null,
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ schemaVersion: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { req, ctx } = makeCtx();
    await GET(req, ctx);

    const fetchArgs = fetchMock.mock.calls[0];
    expect(fetchArgs[0]).toBe("https://blob/events.json");
    expect(fetchArgs[1].headers).toMatchObject({
      Authorization: "Bearer secret_xyz",
    });
  });
});
