import OpenAI from "openai";
import { toFile } from "openai";
import { env } from "@/lib/env";
import { WHISPER_MAX_BYTES } from "@/lib/transcribe-constants";
import { splitAudioIntoWhisperParts, type WhisperAudioPart } from "@/lib/transcribe-ffmpeg";

export { WHISPER_MAX_BYTES } from "@/lib/transcribe-constants";

export type TranscribeSuccess = {
  transcript: string;
  durationSeconds: number | null;
};

export type TranscribeResult = TranscribeSuccess | { error: string };

async function transcribeSinglePart(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<TranscribeResult> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY! });

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

function normalizeMime(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

/**
 * Transcribe an audio buffer with OpenAI Whisper.
 *
 * Files over 25 MB are split server-side with ffmpeg into time-aligned parts,
 * transcribed sequentially, and concatenated (same total semantics as one file).
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

  let parts: WhisperAudioPart[];
  if (buffer.byteLength <= WHISPER_MAX_BYTES) {
    parts = [{ buffer, filename, mimeType: normalizeMime(mimeType) }];
  } else {
    try {
      parts = await splitAudioIntoWhisperParts(buffer, filename, mimeType);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[transcribe] ffmpeg split failed:", msg);
      return {
        error:
          "This recording is too large to prepare for transcription automatically. Try a shorter session, split into multiple recordings, or use Upload with a smaller file.",
      };
    }
  }

  const transcripts: string[] = [];
  let totalDuration: number | null = 0;

  for (const part of parts) {
    if (part.buffer.byteLength > WHISPER_MAX_BYTES) {
      console.error("[transcribe] internal: part still exceeds Whisper limit", part.buffer.byteLength);
      return {
        error:
          "Could not split audio into small enough parts for transcription. Try a shorter recording or use Upload.",
      };
    }

    const result = await transcribeSinglePart(part.buffer, part.filename, part.mimeType);
    if ("error" in result) return result;
    if (result.transcript) transcripts.push(result.transcript);
    if (result.durationSeconds != null) {
      totalDuration = (totalDuration ?? 0) + result.durationSeconds;
    } else {
      totalDuration = null;
    }
  }

  return {
    transcript: transcripts.join("\n\n").trim(),
    durationSeconds: totalDuration,
  };
}
