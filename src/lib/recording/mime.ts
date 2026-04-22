/**
 * MediaRecorder MIME selection + filename extension mapping.
 *
 * Priority is webm-first because Chrome / Firefox / Edge produce well-formed
 * WebM that plays back reliably in <audio>. Chrome on Windows DOES report
 * `audio/mp4` as supported in recent versions, but its MP4 output is known to
 * have malformed container metadata (no proper duration, won't seek, often
 * won't play back) — even though Whisper can still decode the raw audio.
 *
 * iOS Safari is the only browser that doesn't support audio/webm, so it falls
 * through to audio/mp4 naturally. The no-timeslice `recorder.start()` call in
 * the hook keeps iOS MP4 output non-fragmented and playable.
 *
 * If you change MIME_CANDIDATES order, manually verify preview playback in
 * BOTH desktop Chrome and iOS Safari — this list has regressed twice. The
 * regression test in `src/__tests__/recording/mime.test.ts` enforces the
 * webm-before-mp4 invariant.
 */

export const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

/** Pick the best supported MIME type for MediaRecorder, in priority order. */
export function chooseMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

/** Map a chosen MIME type to the right filename extension. Defaults to webm. */
export function fileExtension(mimeType: string): string {
  if (mimeType.startsWith("audio/mp4")) return "mp4";
  if (mimeType.startsWith("audio/ogg")) return "ogg";
  return "webm";
}
