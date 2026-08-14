/**
 * @jest-environment node
 *
 * Unit tests for proxy-blob-asset shared stream core.
 * Oracle: SSRF guard rejects out-of-scope URLs before blob I/O;
 * parse errors; stream headers and blob get invocation.
 */

const mockBlobGet = jest.fn();

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  get: (...args: unknown[]) => mockBlobGet(...args),
}));

import {
  isWbAssetUrlInSessionScope,
  parseWbAssetUrlFromSearchParams,
  streamPrivateWbAsset,
} from "@/lib/whiteboard/proxy-blob-asset";

function inScopeAssetUrl(studentId: string, sessionId: string) {
  return `https://blob.vercel-storage.com/whiteboard-sessions/${studentId}/${sessionId}/asset.png`;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBlobGet.mockResolvedValue({
    statusCode: 200,
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("png-bytes"));
        controller.close();
      },
    }),
    blob: { contentType: "image/png" },
  });
});

describe("parseWbAssetUrlFromSearchParams", () => {
  it("missing u → 400", async () => {
    const result = parseWbAssetUrlFromSearchParams(new URLSearchParams());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect(await result.response.text()).toMatch(/missing u/i);
    }
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("invalid u → 400", async () => {
    const result = parseWbAssetUrlFromSearchParams(
      new URLSearchParams({ u: "not-a-url" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect(await result.response.text()).toMatch(/invalid u/i);
    }
  });

  it("valid encoded u → decoded publicUrl", () => {
    const url = inScopeAssetUrl("stu_a", "wb_b");
    const result = parseWbAssetUrlFromSearchParams(
      new URLSearchParams({ u: encodeURIComponent(url) })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.publicUrl).toBe(url);
    }
  });
});

describe("isWbAssetUrlInSessionScope — SSRF guard", () => {
  it("in-scope pathname → true", () => {
    const url = inScopeAssetUrl("stu_a", "wb_b");
    expect(
      isWbAssetUrlInSessionScope(url, {
        studentId: "stu_a",
        whiteboardSessionId: "wb_b",
      })
    ).toBe(true);
  });

  it("in-scope path on non-allowlisted host → false (SSRF origin pin)", () => {
    const url =
      "https://evil.example/whiteboard-sessions/stu_a/wb_b/asset.png";
    expect(
      isWbAssetUrlInSessionScope(url, {
        studentId: "stu_a",
        whiteboardSessionId: "wb_b",
      })
    ).toBe(false);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("foreign session namespace → false (no blob fetch)", async () => {
    const url = inScopeAssetUrl("stu_a", "wb_other");
    expect(
      isWbAssetUrlInSessionScope(url, {
        studentId: "stu_a",
        whiteboardSessionId: "wb_b",
      })
    ).toBe(false);

    // Simulate route pattern: scope check before stream
    if (
      !isWbAssetUrlInSessionScope(url, {
        studentId: "stu_a",
        whiteboardSessionId: "wb_b",
      })
    ) {
      expect(mockBlobGet).not.toHaveBeenCalled();
      return;
    }
    await streamPrivateWbAsset(url, { cacheMaxAge: 3600, blobGet: mockBlobGet });
    fail("should not reach stream");
  });
});

describe("streamPrivateWbAsset", () => {
  it("happy path → 200 with content-type and cache max-age", async () => {
    const url = inScopeAssetUrl("stu_a", "wb_b");
    const res = await streamPrivateWbAsset(url, {
      cacheMaxAge: 3600,
      blobGet: mockBlobGet,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(await res.text()).toBe("png-bytes");
    expect(mockBlobGet).toHaveBeenCalledWith(url, { access: "private" });
  });

  it("blob get miss → 404", async () => {
    mockBlobGet.mockResolvedValue({ statusCode: 404, stream: null, blob: {} });
    const url = inScopeAssetUrl("stu_a", "wb_b");
    const res = await streamPrivateWbAsset(url, {
      cacheMaxAge: 300,
      blobGet: mockBlobGet,
    });
    expect(res.status).toBe(404);
  });

  it("respects parameterized cache max-age (tutor 300 vs student 3600)", async () => {
    const url = inScopeAssetUrl("stu_a", "wb_b");
    const res = await streamPrivateWbAsset(url, {
      cacheMaxAge: 300,
      blobGet: mockBlobGet,
    });
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
  });
});
