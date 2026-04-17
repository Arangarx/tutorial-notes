import OpenAI from "openai";
import { toFile } from "openai";
import { env } from "@/lib/env";

/** Max audio file size sent to Whisper (25 MB — OpenAI's hard limit). */
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

export type TranscribeSuccess = {
  transcript: string;
  durationSeconds: number | null;
};

export type TranscribeResult = TranscribeSuccess | { error: string };

/**
 * Transcribe an audio buffer with OpenAI Whisper.
 *
 * Returns {transcript, durationSeconds} on success, or {error} on failure.
 * Degrades gracefully when OPENAI_API_KEY is absent.
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<TranscribeResult> {
  if (!env.OPENAI_API_KEY) {
    return { error: "not configured" };
  }

  if (buffer.byteLength > WHISPER_MAX_BYTES) {
    return {
      error: `Audio file too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is 25 MB.`,
    };
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  try {
    const file = await toFile(buffer, filename, { type: mimeType });

    const response = await client.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
    });

    const transcript =
      typeof response === "object" && response !== null && "text" in response
        ? String((response as { text: string }).text).trim()
        : "";

    const duration =
      typeof response === "object" &&
      response !== null &&
      "duration" in response &&
      typeof (response as { duration: unknown }).duration === "number"
        ? Math.round((response as { duration: number }).duration)
        : null;

    return { transcript, durationSeconds: duration };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[transcribe] Whisper request failed:", msg);
    return { error: "Transcription failed. Please try again." };
  }
}
