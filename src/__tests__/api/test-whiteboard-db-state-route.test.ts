/**
 * @jest-environment node
 *
 * Route-level gate for GET /api/test/whiteboard/[sessionId]/db-state.
 */

const dbWhiteboardEventBatchCount = jest.fn();
const dbWhiteboardSessionFindUnique = jest.fn();
const dbWhiteboardEventBatchFindFirst = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardEventBatch: {
      count: (...args: unknown[]) => dbWhiteboardEventBatchCount(...args),
      findFirst: (...args: unknown[]) => dbWhiteboardEventBatchFindFirst(...args),
    },
    whiteboardSession: {
      findUnique: (...args: unknown[]) => dbWhiteboardSessionFindUnique(...args),
    },
  },
}));

describe("GET /api/test/whiteboard/[sessionId]/db-state", () => {
  const envSnapshot = { ...process.env };
  const SESSION_ID = "wbsid-route-gate-test";

  beforeEach(() => {
    jest.clearAllMocks();
    dbWhiteboardEventBatchCount.mockResolvedValue(0);
    dbWhiteboardSessionFindUnique.mockResolvedValue(null);
    dbWhiteboardEventBatchFindFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    jest.resetModules();
  });

  function makeRequest(secret = "playwright-test-secret") {
    return new Request(
      `http://localhost/api/test/whiteboard/${SESSION_ID}/db-state`,
      {
        headers: { authorization: `Bearer ${secret}` },
      }
    );
  }

  test("production + PLAYWRIGHT_TEST=1 + valid secret → 404 and DB untouched", async () => {
    const env = process.env as NodeJS.ProcessEnv & {
      NODE_ENV?: string;
      VERCEL_ENV?: string;
    };
    env.NODE_ENV = "production";
    delete env.VERCEL_ENV;
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { GET } = await import(
      "@/app/api/test/whiteboard/[sessionId]/db-state/route"
    );
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Not found" });
    expect(dbWhiteboardEventBatchCount).not.toHaveBeenCalled();
    expect(dbWhiteboardSessionFindUnique).not.toHaveBeenCalled();
    expect(dbWhiteboardEventBatchFindFirst).not.toHaveBeenCalled();
  });

  test("test env + valid secret → 200 and handler queries DB", async () => {
    const env = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
    env.NODE_ENV = "test";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { GET } = await import(
      "@/app/api/test/whiteboard/[sessionId]/db-state/route"
    );
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });

    expect(res.status).toBe(200);
    expect(dbWhiteboardEventBatchCount).toHaveBeenCalledWith({
      where: { whiteboardSessionId: SESSION_ID },
    });
    expect(dbWhiteboardSessionFindUnique).toHaveBeenCalled();
    expect(dbWhiteboardEventBatchFindFirst).toHaveBeenCalled();
  });

  test("test env + wrong secret → 401 and DB untouched", async () => {
    const env = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
    env.NODE_ENV = "test";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { GET } = await import(
      "@/app/api/test/whiteboard/[sessionId]/db-state/route"
    );
    const res = await GET(makeRequest("wrong-secret") as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });

    expect(res.status).toBe(401);
    expect(dbWhiteboardEventBatchCount).not.toHaveBeenCalled();
  });
});
