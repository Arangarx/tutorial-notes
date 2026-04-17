/**
 * Audio constants shared between server-side blob helpers and client components.
 * This file MUST NOT import from @/lib/env or any server-only module.
 */

/** Accepted audio MIME types. */
export const ACCEPTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
] as const;

/** Max upload size: 100 MB (well above any 60-min session at practical bitrates). */
export const BLOB_MAX_BYTES = 100 * 1024 * 1024;

/** Check if a MIME type is an accepted audio type (normalises before codec suffix). */
export function isAcceptedAudioType(mimeType: string): boolean {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return ACCEPTED_AUDIO_TYPES.some((t) => t.split(";")[0].trim() === base);
}
