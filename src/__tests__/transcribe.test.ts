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

import { transcribeAudio, WHISPER_MAX_BYTES } from "@/lib/transcribe";

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

  test("returns error when file is oversized", async () => {
    const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);
    const result = await transcribeAudio(bigBuffer, "big.webm", "audio/webm");

    expect(result).toMatchObject({ error: expect.stringContaining("too large") });
    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
  });

  test("exactly at size limit passes through", async () => {
    const limitBuffer = Buffer.alloc(WHISPER_MAX_BYTES, 0);
    mockTranscriptionsCreate.mockResolvedValue({ text: "ok", duration: 5 });

    const result = await transcribeAudio(limitBuffer, "ok.webm", "audio/webm");
    expect("error" in result).toBe(false);
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

    const { transcribeAudio: transcribeNoKey } = await import("@/lib/transcribe");
    const result = await transcribeNoKey(SMALL_BUFFER, "session.webm", "audio/webm");

    expect(result).toMatchObject({ error: "not configured" });
    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
  });
});
