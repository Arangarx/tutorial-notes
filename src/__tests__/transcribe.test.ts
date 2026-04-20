/**
 * Unit tests for src/lib/transcribe.ts
 * Mocks the OpenAI SDK so no real API calls are made.
 */

const mockTranscriptionsCreate = jest.fn();
jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mockTranscriptionsCreate,
        },
      },
    })),
    toFile: jest.fn().mockImplementation(async (buffer: Buffer, filename: string, opts: Record<string, string>) => ({
      buffer,
      name: filename,
      type: opts?.type ?? "audio/webm",
    })),
  };
});

jest.mock("@/lib/env", () => ({
  env: { OPENAI_API_KEY: "sk-test-key" },
}));

jest.mock("@/lib/transcribe-ffmpeg", () => ({
  splitAudioIntoWhisperParts: jest.fn(),
}));

import { splitAudioIntoWhisperParts } from "@/lib/transcribe-ffmpeg";
import { transcribeAudio, WHISPER_MAX_BYTES } from "@/lib/transcribe";

const mockSplit = splitAudioIntoWhisperParts as jest.MockedFunction<typeof splitAudioIntoWhisperParts>;

const SMALL_BUFFER = Buffer.alloc(1024, 0);

describe("transcribeAudio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("happy path returns transcript and duration", async () => {
    mockTranscriptionsCreate.mockResolvedValue({
      text: "  Student asked about quadratics.  ",
      duration: 183.5,
    });

    const result = await transcribeAudio(SMALL_BUFFER, "session.webm", "audio/webm");

    expect(result).toEqual({
      transcript: "Student asked about quadratics.",
      durationSeconds: 184,
    });
    expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-1",
        response_format: "verbose_json",
      })
    );
    expect(mockSplit).not.toHaveBeenCalled();
  });

  test("trims transcript whitespace", async () => {
    mockTranscriptionsCreate.mockResolvedValue({
      text: "\n  Hello world\n",
      duration: 10,
    });

    const result = await transcribeAudio(SMALL_BUFFER, "session.mp4", "audio/mp4");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.transcript).toBe("Hello world");
    }
  });

  test("returns null durationSeconds when duration is absent", async () => {
    mockTranscriptionsCreate.mockResolvedValue({ text: "hello" });

    const result = await transcribeAudio(SMALL_BUFFER, "session.webm", "audio/webm");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.durationSeconds).toBeNull();
    }
  });

  test("oversized file: splits via ffmpeg helper and concatenates transcripts + durations", async () => {
    mockSplit.mockResolvedValueOnce([
      { buffer: Buffer.alloc(1024, 0), filename: "big-part1.webm", mimeType: "audio/webm" },
      { buffer: Buffer.alloc(1024, 0), filename: "big-part2.webm", mimeType: "audio/webm" },
    ]);
    mockTranscriptionsCreate
      .mockResolvedValueOnce({ text: "  Part one.  ", duration: 10 })
      .mockResolvedValueOnce({ text: "  Part two.  ", duration: 20 });

    const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);
    const result = await transcribeAudio(bigBuffer, "big.webm", "audio/webm");

    expect(mockSplit).toHaveBeenCalledWith(bigBuffer, "big.webm", "audio/webm");
    expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      transcript: "Part one.\n\nPart two.",
      durationSeconds: 30,
    });
  });

  test("oversized file: ffmpeg split failure returns friendly error", async () => {
    mockSplit.mockRejectedValueOnce(new Error("ffmpeg exited 1"));
    const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);
    const result = await transcribeAudio(bigBuffer, "big.webm", "audio/webm");

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/too large|split/i);
    }
    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
  });

  test("exactly at size limit passes through without ffmpeg", async () => {
    const limitBuffer = Buffer.alloc(WHISPER_MAX_BYTES, 0);
    mockTranscriptionsCreate.mockResolvedValue({ text: "ok", duration: 5 });

    const result = await transcribeAudio(limitBuffer, "ok.webm", "audio/webm");
    expect("error" in result).toBe(false);
    expect(mockSplit).not.toHaveBeenCalled();
  });

  test("returns error when API call throws", async () => {
    mockTranscriptionsCreate.mockRejectedValue(new Error("network timeout"));

    const result = await transcribeAudio(SMALL_BUFFER, "session.webm", "audio/webm");
    expect(result).toMatchObject({ error: expect.stringContaining("failed") });
  });

  test("returns error when OPENAI_API_KEY is absent", async () => {
    jest.resetModules();
    jest.doMock("@/lib/env", () => ({ env: {} }));
    jest.doMock("openai", () => ({
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        audio: { transcriptions: { create: mockTranscriptionsCreate } },
      })),
      toFile: jest.fn(),
    }));
    jest.doMock("@/lib/transcribe-ffmpeg", () => ({
      splitAudioIntoWhisperParts: jest.fn(),
    }));

    const { transcribeAudio: transcribeNoKey } = await import("@/lib/transcribe");
    const result = await transcribeNoKey(SMALL_BUFFER, "session.webm", "audio/webm");

    expect(result).toMatchObject({ error: "not configured" });
    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
  });
});
