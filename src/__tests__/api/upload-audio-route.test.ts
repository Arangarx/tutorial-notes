/**
 * Route-handler tests for /api/upload/audio (Vercel Blob handleUpload).
 *
 * The hot zone here is the onBeforeGenerateToken callback — it's the
 * actual gate that prevents tutor A from minting a write token for
 * tutor B's student. We don't need to exercise Vercel Blob's internals,
 * so handleUpload is stubbed to invoke the callback we passed in and
 * return its result. That way the test just asserts our auth + size
 * + content-type policy without booting a real blob store.
 *
 * Phase B1: locks the contract created when client-direct uploads
 * replaced the legacy uploadAudioAction server action.
 */

type GenerateTokenCb = (
  pathname: string,
  clientPayload: string | null,
  multipart: boolean
) => Promise<{
  allowedContentTypes?: string[];
  maximumSizeInBytes?: number;
  addRandomSuffix?: boolean;
  tokenPayload?: string | null;
}>;

const handleUploadMock = jest.fn();
const assertOwnsStudentMock = jest.fn();

jest.mock("@vercel/blob/client", () => ({
  __esModule: true,
  handleUpload: (...args: unknown[]) => handleUploadMock(...args),
}));

jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
}));

import { POST } from "@/app/api/upload/audio/route";
import { BLOB_MAX_BYTES } from "@/lib/audio-constants";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/upload/audio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  handleUploadMock.mockReset();
  assertOwnsStudentMock.mockReset();
});

describe("POST /api/upload/audio", () => {
  test("400s on invalid JSON body", async () => {
    const req = new Request("http://localhost/api/upload/audio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(typeof json.error).toBe("string");
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  test("onBeforeGenerateToken throws when clientPayload is missing studentId", async () => {
    let captured: GenerateTokenCb | null = null;
    handleUploadMock.mockImplementation(async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: GenerateTokenCb }) => {
      captured = onBeforeGenerateToken;
      return { type: "blob.generate-client-token", clientToken: "stubbed" };
    });

    await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }));
    expect(captured).not.toBeNull();
    const cb = captured as unknown as GenerateTokenCb;
    await expect(cb("sessions/x.webm", null, false)).rejects.toThrow(/studentId/i);
    await expect(cb("sessions/x.webm", "{}", false)).rejects.toThrow(/studentId/i);
    expect(assertOwnsStudentMock).not.toHaveBeenCalled();
  });

  test("onBeforeGenerateToken validates ownership and returns the audio constraints", async () => {
    let captured: GenerateTokenCb | null = null;
    handleUploadMock.mockImplementation(async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: GenerateTokenCb }) => {
      captured = onBeforeGenerateToken;
      return { type: "blob.generate-client-token", clientToken: "stubbed" };
    });
    assertOwnsStudentMock.mockResolvedValue(undefined);

    await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }));
    const cb = captured as unknown as GenerateTokenCb;
    const opts = await cb(
      "sessions/stu-1/123-foo.webm",
      JSON.stringify({ studentId: "stu-1" }),
      false
    );

    expect(assertOwnsStudentMock).toHaveBeenCalledWith("stu-1");
    // We use the wildcard `audio/*` (not the explicit ACCEPTED_AUDIO_TYPES
    // list) because Vercel Blob's allow-list matcher rejects parameterized
    // mime values like `audio/webm;codecs=opus`. Real codec/extension policy
    // is enforced upstream when the file is selected. Pinning the wildcard
    // prevents an accidental tightening that would resurrect Sarah's 400.
    expect(opts.allowedContentTypes).toEqual(["audio/*"]);
    expect(opts.maximumSizeInBytes).toBe(BLOB_MAX_BYTES);
    expect(opts.addRandomSuffix).toBe(true);
    // tokenPayload round-trips studentId so the completion log can name it.
    const tokenPayload = JSON.parse(opts.tokenPayload as string) as {
      studentId: string;
      rid?: string;
    };
    expect(tokenPayload.studentId).toBe("stu-1");
    expect(typeof tokenPayload.rid).toBe("string");
  });

  test("onBeforeGenerateToken bubbles ownership rejection up to handleUpload", async () => {
    let captured: GenerateTokenCb | null = null;
    handleUploadMock.mockImplementation(async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: GenerateTokenCb }) => {
      captured = onBeforeGenerateToken;
      return { type: "blob.generate-client-token", clientToken: "stubbed" };
    });
    assertOwnsStudentMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }));
    const cb = captured as unknown as GenerateTokenCb;
    await expect(
      cb("sessions/stu-2/123-foo.webm", JSON.stringify({ studentId: "stu-2" }), false)
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(assertOwnsStudentMock).toHaveBeenCalledWith("stu-2");
  });

  test("returns the handleUpload result on success", async () => {
    handleUploadMock.mockResolvedValue({
      type: "blob.generate-client-token",
      clientToken: "stubbed-token-abc",
    });
    const res = await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { type: string; clientToken: string };
    expect(json.type).toBe("blob.generate-client-token");
    expect(json.clientToken).toBe("stubbed-token-abc");
  });

  test("returns 400 when handleUpload throws (e.g. signature/auth failure)", async () => {
    handleUploadMock.mockRejectedValue(new Error("bad signature"));
    const res = await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string; debugId?: string };
    expect(json.error).toContain("bad signature");
    expect(typeof json.debugId).toBe("string");
  });
});
