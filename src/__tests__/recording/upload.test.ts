/**
 * Locks the retry-once policy used by the recorder when saving segments.
 *
 * Real-world failure mode: transient Vercel Blob 5xx or a flaky mobile data
 * hop. A second attempt almost always succeeds. We deliberately do NOT retry
 * more than once — tutors should see the error and pivot to the Upload tab if
 * both attempts fail (the audio is still in browser memory at that point).
 *
 * The retry layer's contract changed in B1 (client-direct upload): the
 * uploader now takes a Blob + filename + mime directly instead of a
 * FormData. These tests pin both the new shape and the retry behavior.
 */

import {
  uploadAudioWithRetry,
  type UploadAudioFn,
  type UploadAudioResult,
} from "@/lib/recording/upload";

function makeBlob(text = "hello"): Blob {
  return new Blob([text], { type: "audio/webm" });
}

describe("uploadAudioWithRetry", () => {
  test("returns success on first try without retrying", async () => {
    const fn: jest.MockedFunction<UploadAudioFn> = jest
      .fn<Promise<UploadAudioResult>, [string, Blob, string, string]>()
      .mockResolvedValue({
        ok: true,
        blobUrl: "https://blob/x",
        mimeType: "audio/webm",
        sizeBytes: 5,
      });
    const res = await uploadAudioWithRetry(fn, "stu-1", makeBlob(), "a.webm", "audio/webm");
    expect(res.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries exactly once on failure and returns the second result", async () => {
    const fn: jest.MockedFunction<UploadAudioFn> = jest
      .fn<Promise<UploadAudioResult>, [string, Blob, string, string]>()
      .mockResolvedValueOnce({ ok: false, error: "boom" })
      .mockResolvedValueOnce({
        ok: true,
        blobUrl: "https://blob/y",
        mimeType: "audio/webm",
        sizeBytes: 5,
      });
    const res = await uploadAudioWithRetry(fn, "stu-1", makeBlob(), "a.webm", "audio/webm");
    expect(res.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("does NOT retry a second time when both attempts fail", async () => {
    const fn: jest.MockedFunction<UploadAudioFn> = jest
      .fn<Promise<UploadAudioResult>, [string, Blob, string, string]>()
      .mockResolvedValueOnce({ ok: false, error: "first" })
      .mockResolvedValueOnce({ ok: false, error: "second", debugId: "rid-2" });
    const res = await uploadAudioWithRetry(fn, "stu-1", makeBlob(), "a.webm", "audio/webm");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("second");
      expect(res.debugId).toBe("rid-2");
    }
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("forwards studentId, blob, filename, and mimeType to the uploader", async () => {
    const blob = makeBlob();
    const fn: jest.MockedFunction<UploadAudioFn> = jest.fn(async (sid, b, name, mime) => {
      expect(sid).toBe("stu-77");
      expect(b).toBe(blob);
      expect(name).toBe("session-1.webm");
      expect(mime).toBe("audio/webm");
      return { ok: true, blobUrl: "https://blob/z", mimeType: mime, sizeBytes: b.size } as UploadAudioResult;
    });
    const res = await uploadAudioWithRetry(fn, "stu-77", blob, "session-1.webm", "audio/webm");
    expect(res.ok).toBe(true);
    expect(fn).toHaveBeenCalledWith("stu-77", blob, "session-1.webm", "audio/webm");
  });

  test("each attempt re-passes the same blob (no FormData consumption)", async () => {
    // Pre-B1 the helper built a fresh FormData per attempt; with the new
    // direct-upload contract the blob is reusable, so we just confirm
    // both calls received the identical Blob reference.
    const blob = makeBlob();
    const seen: Blob[] = [];
    const fn: jest.MockedFunction<UploadAudioFn> = jest
      .fn<Promise<UploadAudioResult>, [string, Blob, string, string]>()
      .mockImplementation(async (_id, b) => {
        seen.push(b);
        return { ok: false, error: "fail" } as UploadAudioResult;
      });
    await uploadAudioWithRetry(fn, "stu-1", blob, "a.webm", "audio/webm");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(blob);
    expect(seen[1]).toBe(blob);
  });
});
