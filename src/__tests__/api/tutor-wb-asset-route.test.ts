/**
 * @jest-environment node
 *
 * Tutor wb-asset proxy — SSRF + authz contract (thin route over proxy-blob-asset).
 */

const mockBlobGet = jest.fn();

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  get: (...args: unknown[]) => mockBlobGet(...args),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (...args: unknown[]) =>
    assertOwnsWhiteboardSessionMock(...args),
}));

const assertStudentNotErasedApiMock = jest.fn();
jest.mock("@/lib/erasure/assert-student-not-erased", () => ({
  __esModule: true,
  assertStudentNotErasedApi: (...args: unknown[]) =>
    assertStudentNotErasedApiMock(...args),
}));

import { GET } from "@/app/api/whiteboard/[sessionId]/tutor-asset/route";

const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

function inScopeAssetUrl(studentId: string, sessionId: string) {
  return `https://blob.vercel-storage.com/whiteboard-sessions/${studentId}/${sessionId}/asset.png`;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "test_blob_rw_token";
  assertOwnsWhiteboardSessionMock.mockResolvedValue({
    id: "wb_sess",
    studentId: "stu_a",
  });
  assertStudentNotErasedApiMock.mockResolvedValue(null);
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

afterAll(() => {
  if (originalBlobToken === undefined) {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  } else {
    process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
  }
});

describe("GET /api/whiteboard/[sessionId]/tutor-asset — tutor proxy SSRF contract", () => {
  it("evil-host u with in-scope path → 404 and does not fetch blob", async () => {
    const assetUrl =
      "https://evil.example/whiteboard-sessions/stu_a/wb_sess/asset.png";
    const res = await GET(
      new Request(
        `http://localhost/api/whiteboard/wb_sess/tutor-asset?u=${encodeURIComponent(assetUrl)}`
      ),
      { params: Promise.resolve({ sessionId: "wb_sess" }) }
    );

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("out-of-scope u → 404 and does not fetch blob", async () => {
    const assetUrl = inScopeAssetUrl("stu_a", "wb_other");
    const res = await GET(
      new Request(
        `http://localhost/api/whiteboard/wb_sess/tutor-asset?u=${encodeURIComponent(assetUrl)}`
      ),
      { params: Promise.resolve({ sessionId: "wb_sess" }) }
    );

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("in-scope u → 200 with tutor cache max-age 300", async () => {
    const assetUrl = inScopeAssetUrl("stu_a", "wb_sess");
    const res = await GET(
      new Request(
        `http://localhost/api/whiteboard/wb_sess/tutor-asset?u=${encodeURIComponent(assetUrl)}`
      ),
      { params: Promise.resolve({ sessionId: "wb_sess" }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(mockBlobGet).toHaveBeenCalledTimes(1);
  });
});
