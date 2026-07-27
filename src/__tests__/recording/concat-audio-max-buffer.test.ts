/**
 * @jest-environment node
 *
 * Dedupe Wave A — concat ffmpeg execFile maxBuffer must track BLOB_MAX_BYTES
 * from audio-constants (not a duplicated 100*1024*1024 literal).
 *
 * Independent oracle: canonical BLOB_MAX_BYTES export (100 MB).
 */

import type { ExecFileOptions } from "node:child_process";
import { writeFileSync } from "node:fs";

const mockExecFile = jest.fn();

jest.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

jest.mock("ffmpeg-static", () => "/usr/bin/ffmpeg");

jest.mock("@/lib/blob", () => ({
  fetchPrivateBlobBytes: jest.fn().mockResolvedValue({
    buffer: Buffer.from("fake-webm"),
  }),
}));

jest.mock("@/lib/transcribe-ffmpeg", () => ({
  probeAudioBufferDurationSeconds: jest.fn().mockResolvedValue(12),
}));

jest.mock("@vercel/blob", () => ({
  put: jest.fn().mockResolvedValue({
    url: "https://abc.blob.vercel-storage.com/concat.webm",
  }),
}));

jest.mock("@/lib/blob-harness", () => ({
  harnessServerPut: jest.fn(),
  isBlobHarnessActive: jest.fn().mockReturnValue(false),
}));

import { BLOB_MAX_BYTES } from "@/lib/audio-constants";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";
import { concatMixdownSegmentsToBlob } from "@/lib/recording/concat-audio";

beforeEach(() => {
  mockExecFile.mockImplementation(
    (
      _file: string,
      args: string[],
      options: ExecFileOptions,
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      const outputPath = args[args.length - 1];
      if (typeof outputPath === "string") {
        writeFileSync(outputPath, Buffer.from("fake-concat-webm"));
      }
      callback(null, "", "");
      return undefined;
    }
  );
});

describe("concatMixdownSegmentsToBlob ffmpeg maxBuffer", () => {
  it("passes BLOB_MAX_BYTES as execFile maxBuffer (canonical audio-constants)", async () => {
    const result = await concatMixdownSegmentsToBlob({
      adminUserId: "admin-1",
      studentId: "stu-1",
      whiteboardSessionId: "wbs-1",
      segments: [
        {
          blobUrl: "https://abc.blob.vercel-storage.com/a.webm",
          mimeType: "audio/webm",
          streamId: TUTOR_MIC_STREAM_ID,
          orderIndex: 0,
        },
        {
          blobUrl: "https://abc.blob.vercel-storage.com/b.webm",
          mimeType: "audio/webm",
          streamId: TUTOR_MIC_STREAM_ID,
          orderIndex: 1,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(mockExecFile).toHaveBeenCalled();
    const execOptions = mockExecFile.mock.calls[0]?.[2] as ExecFileOptions;
    expect(execOptions.maxBuffer).toBe(BLOB_MAX_BYTES);
    expect(execOptions.maxBuffer).toBe(100 * 1024 * 1024);
  });
});
