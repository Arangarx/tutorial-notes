/**
 * Locks the retry-once policy used by the recorder when saving segments.
 *
 * Real-world failure mode: transient Vercel Blob 5xx or a flaky mobile data
 * hop. A second attempt almost always succeeds. We deliberately do NOT retry
 * more than once — tutors should see the error and pivot to the Upload tab if
 * both attempts fail (the audio is still in browser memory at that point).
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
    const fn: jest.MockedFunction<UploadAudioFn> = jest.fn(async () =>
      ({ ok: true, blobUrl: "https://blob/x", mimeType: "audio/webm", sizeBytes: 5 } as UploadAudioResult)
    );
    const res = await uploadAudioWithRetry(fn, "stu-1", makeBlob(), "a.webm", "audio/webm");
    expect(res.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries exactly once on failure and returns the second result", async () => {
    const fn: jest.MockedFunction<UploadAudioFn> = jest
      .fn<Promise<UploadAudioResult>, [string, FormData]>()
      .mockResolvedValueOnce({ ok: false, error: "boom" })
      .mockResolvedValueOnce({ ok: true, blobUrl: "https://blob/y", mimeType: "audio/webm", sizeBytes: 5 });
    const res = await uploadAudioWithRetry(fn, "stu-1", makeBlob(), "a.webm", "audio/webm");
    expect(res.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("does NOT retry a second time when both attempts fail", async () => {
    const fn: jest.MockedFunction<UploadAudioFn> = jest
      .fn<Promise<UploadAudioResult>, [string, FormData]>()
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

  test("forwards studentId and a multipart 'file' field with the right name + type", async () => {
    const fn: jest.MockedFunction<UploadAudioFn> = jest.fn(async (_studentId, fd) => {
      const file = fd.get("file");
      expect(file).toBeInstanceOf(File);
      const f = file as File;
      expect(f.name).toBe("session-1.webm");
      expect(f.type).toBe("audio/webm");
      expect(f.size).toBe(5);
      return { ok: true, blobUrl: "https://blob/z", mimeType: f.type, sizeBytes: f.size } as UploadAudioResult;
    });
    const res = await uploadAudioWithRetry(fn, "stu-77", makeBlob(), "session-1.webm", "audio/webm");
    expect(res.ok).toBe(true);
    expect(fn).toHaveBeenCalledWith("stu-77", expect.any(FormData));
  });

  test("each attempt builds a fresh FormData (FormData isn't reusable across actions)", async () => {
    const seen: FormData[] = [];
    const fn: jest.MockedFunction<UploadAudioFn> = jest
      .fn<Promise<UploadAudioResult>, [string, FormData]>()
      .mockImplementation(async (_id, fd) => {
        seen.push(fd);
        return { ok: false, error: "fail" } as UploadAudioResult;
      });
    await uploadAudioWithRetry(fn, "stu-1", makeBlob(), "a.webm", "audio/webm");
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});
