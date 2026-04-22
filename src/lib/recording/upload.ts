/**
 * Audio segment upload helper with retry-once semantics.
 *
 * Two related responsibilities live here:
 *
 *  1. The retry policy (uploadAudioWithRetry). One retry, never more.
 *     Real-world failure mode: a transient Vercel Blob 5xx or a flaky
 *     mobile data hop. A second attempt almost always succeeds. We
 *     deliberately do NOT retry more than once — if both attempts fail
 *     we surface the error so the tutor can switch to the Upload tab
 *     while the audio is still in browser memory.
 *
 *  2. The default uploader (uploadAudioDirect). Browser → Vercel Blob
 *     directly via @vercel/blob/client.upload(), routed through our
 *     handleUpload route handler at /api/upload/audio. This bypasses
 *     Vercel server functions' 4.5MB request body cap (which is what
 *     made Sarah's 17.9MB m4a fail with "unexpected response from the
 *     server"). The route handler enforces auth + ownership before
 *     signing the upload token; see app/api/upload/audio/route.ts.
 *
 * Tests: see __tests__/recording/upload.test.ts. The retry policy is
 * exercised against an injected stub uploader so we don't need to spin
 * up Vercel Blob during unit tests.
 */

export type UploadAudioResult =
  | { ok: true; blobUrl: string; mimeType: string; sizeBytes: number }
  | { ok: false; error: string; debugId?: string };

/**
 * Direct uploader contract.
 *
 * The retry layer accepts any function with this signature so production
 * code uses uploadAudioDirect (browser → Vercel Blob), while tests pass
 * an in-memory stub. FormData isn't part of the shape any more — the
 * old server-action path went away in B1 because it could not handle
 * payloads above the Vercel function 4.5MB cap.
 */
export type UploadAudioFn = (
  studentId: string,
  blob: Blob,
  filename: string,
  mimeType: string
) => Promise<UploadAudioResult>;

/**
 * Sanitise a user-supplied filename for use in a Vercel Blob pathname.
 * Vercel itself accepts the full character set, but we're conservative
 * here so log lines and URLs stay copy-pasteable.
 */
function safeName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "recording.bin";
}

/**
 * Upload an audio blob directly from the browser to Vercel Blob.
 *
 * The browser fetches a single-use token from /api/upload/audio (which
 * checks the tutor owns this student) and then PUTs the bytes straight
 * to Vercel's edge — our function never touches the audio stream, so
 * the only practical size cap is BLOB_MAX_BYTES enforced server-side.
 *
 * The studentId is only used in the clientPayload for the route handler
 * to validate against; the pathname itself uses a randomised suffix so
 * URLs aren't enumerable from the studentId alone.
 *
 * Errors map to UploadAudioResult.error in plain language so the
 * recorder/upload UIs can show them without inspecting the cause.
 */
export async function uploadAudioDirect(
  studentId: string,
  blob: Blob,
  filename: string,
  mimeType: string
): Promise<UploadAudioResult> {
  const pathname = `sessions/${studentId}/${Date.now()}-${safeName(filename)}`;
  // Strip any codec parameter from the content-type before handing it to
  // Vercel Blob. Chrome's MediaRecorder reports "audio/webm;codecs=opus"
  // for `recorder.mimeType`, but Vercel Blob's allowedContentTypes
  // matcher does NOT accept codec parameters and will 400 the PUT with
  // content_type_not_allowed. The actual byte stream is still WebM —
  // the codec hint isn't load-bearing for either Whisper or playback.
  const cleanContentType = mimeType.split(";")[0].trim() || "application/octet-stream";
  try {
    // Dynamic import keeps @vercel/blob/client out of the server bundle
    // and out of jest's default node environment when this module is
    // imported by code paths that never actually upload (e.g. the
    // segment-policy unit tests pull in ../upload via barrel files).
    const { upload } = await import("@vercel/blob/client");
    // access: "private" is REQUIRED — our Vercel Blob store is configured
    // for private access (see store ID in BLOB_READ_WRITE_TOKEN). Passing
    // "public" returns a 400 with no CORS headers from Vercel's edge,
    // which surfaces in the browser as "ERR_FAILED 400 (Bad Request)" and
    // a misleading "blocked by CORS policy" error. Private blobs require
    // a Bearer token to fetch, but our app proxies all audio playback
    // through /api/audio/[recordingId] (and the admin equivalent), so
    // the recorded URL is never served directly to the browser.
    const result = await upload(pathname, blob, {
      access: "private",
      handleUploadUrl: "/api/upload/audio",
      contentType: cleanContentType,
      clientPayload: JSON.stringify({ studentId }),
    });
    return {
      ok: true,
      blobUrl: result.url,
      mimeType,
      sizeBytes: blob.size,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Log the raw BlobError to the browser console so failures are
    // diagnosable without cracking open the bundle. This is in addition
    // to the friendly message we surface to the recorder UI — when a
    // tutor reports "uploading hung" we want the actual reason in the
    // console they can paste back.
    if (typeof console !== "undefined") {
      console.error("[uploadAudioDirect] upload failed", {
        pathname,
        contentType: cleanContentType,
        sizeBytes: blob.size,
        rawError: raw,
      });
    }
    // Vercel Blob's client throws BlobAccessError / BlobUnknownError /
    // BlobError subclasses. They all have human-readable .message values
    // already, but we wrap them in tutor-friendly copy and keep the
    // original in the debugId so support can correlate.
    const friendly = raw.toLowerCase().includes("body limit")
      ? `Recording exceeded the maximum upload size. ${raw}`
      : `Could not save the recording to storage. Please try again. (${raw})`;
    return { ok: false, error: friendly };
  }
}

/**
 * Upload an audio blob with a single retry on failure.
 *
 * Why retry once: the most common failure mode in the field is a transient
 * Vercel Blob 5xx or a flaky mobile data hop. A second attempt almost always
 * succeeds. We deliberately do NOT retry more than once — if both attempts
 * fail we surface the error so the tutor can switch to the Upload tab while
 * the audio is still in browser memory.
 */
export async function uploadAudioWithRetry(
  uploadFn: UploadAudioFn,
  studentId: string,
  blob: Blob,
  filename: string,
  mimeType: string
): Promise<UploadAudioResult> {
  let result = await uploadFn(studentId, blob, filename, mimeType);
  if (!result.ok) {
    result = await uploadFn(studentId, blob, filename, mimeType);
  }
  return result;
}
