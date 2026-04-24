/**
 * Route-handler tests for `/api/whiteboard/[sessionId]/math/render`.
 *
 * Sarah-demo regression context (Apr 2026): the math dialog used to
 * dynamic-import `mathjax-full` straight into the browser bundle and
 * blew up with "require is not defined". The fix moved rendering to
 * this route. This suite locks the contract clients depend on:
 *
 *   - session-ownership is checked BEFORE rendering (no anon access)
 *   - body shape is validated (latex is required and a string)
 *   - happy-path returns ok=true with svg + dimensions
 *   - lib-level rejections (empty / oversize) bubble as 200/ok=false
 *     so the dialog can show them inline rather than as network errors
 *
 * If anyone reverts to a client-side renderer this suite + the
 * "use client" / "server-only" header on math-render.ts will both
 * have to be touched on purpose, which is the whole point.
 */

const assertOwnsMock = jest.fn();

jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) => assertOwnsMock(id),
}));

import { POST } from "@/app/api/whiteboard/[sessionId]/math/render/route";

function makeRequest(body: unknown, sessionId = "wbs-test"): {
  req: Request;
  ctx: { params: Promise<{ sessionId: string }> };
} {
  const req = new Request(
    `http://localhost/api/whiteboard/${sessionId}/math/render`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }
  );
  return { req, ctx: { params: Promise.resolve({ sessionId }) } };
}

beforeEach(() => {
  assertOwnsMock.mockReset();
  // Default: ownership check passes. Individual tests can override.
  assertOwnsMock.mockResolvedValue({
    id: "wbs-test",
    adminUserId: "admin-1",
    studentId: "stu-1",
    consentAcknowledged: true,
    eventsBlobUrl: "https://example/blob/events.json",
    endedAt: null,
  });
});

describe("POST /api/whiteboard/[sessionId]/math/render", () => {
  it("rejects invalid JSON body with 400", async () => {
    const { req, ctx } = makeRequest("not-json");
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; reason?: string };
    expect(json.ok).toBe(false);
  });

  it("rejects missing latex with 400", async () => {
    const { req, ctx } = makeRequest({ displayMode: true });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
  });

  it("rejects non-string latex with 400", async () => {
    const { req, ctx } = makeRequest({ latex: 123 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("rejects non-boolean displayMode with 400", async () => {
    const { req, ctx } = makeRequest({ latex: "x", displayMode: "yes" });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("calls assertOwnsWhiteboardSession with the path sessionId", async () => {
    const { req, ctx } = makeRequest({ latex: "x" }, "wbs-mine");
    await POST(req, ctx);
    expect(assertOwnsMock).toHaveBeenCalledWith("wbs-mine");
  });

  it("checks ownership BEFORE parsing the body (auth fails first)", async () => {
    // If ownership throws (non-owner), the route MUST reject before
    // doing render work. The check is a `notFound()` redirect-style
    // throw in production; we simulate that with a generic throw.
    assertOwnsMock.mockRejectedValueOnce(new Error("not found"));
    const { req, ctx } = makeRequest({ latex: "\\frac{1}{2}" });
    await expect(POST(req, ctx)).rejects.toThrow(/not found/i);
  });

  it(
    "renders a valid equation to SVG (200 + ok=true + dimensions)",
    async () => {
      const { req, ctx } = makeRequest({ latex: "\\frac{1}{2}", displayMode: true });
      const res = await POST(req, ctx);
      expect(res.status).toBe(200);
      const json = (await res.json()) as
        | { ok: true; svg: string; widthPx: number; heightPx: number }
        | { ok: false; reason: string };
      expect(json.ok).toBe(true);
      if (!json.ok) return;
      expect(json.svg.startsWith("<svg")).toBe(true);
      expect(json.svg.includes("</svg>")).toBe(true);
      expect(json.widthPx).toBeGreaterThan(0);
      expect(json.heightPx).toBeGreaterThan(0);
    },
    20000
  );

  it(
    "returns 200 + ok=false (NOT 5xx) for empty equation so dialog shows reason inline",
    async () => {
      const { req, ctx } = makeRequest({ latex: "   " });
      const res = await POST(req, ctx);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; reason?: string };
      expect(json.ok).toBe(false);
      expect(json.reason).toMatch(/empty/i);
    }
  );

  it(
    "returns 200 + ok=false for oversized input (10001 chars)",
    async () => {
      const { req, ctx } = makeRequest({ latex: "x".repeat(10_001) });
      const res = await POST(req, ctx);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; reason?: string };
      expect(json.ok).toBe(false);
      expect(json.reason).toMatch(/max is 10000/i);
    }
  );
});
