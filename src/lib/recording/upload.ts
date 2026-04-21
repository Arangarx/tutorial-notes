/**
 * Audio segment upload helper with retry-once semantics.
 *
 * Lifted out of `AudioRecordInput.stopAndUpload` so the retry policy can be
 * unit tested without spinning up the whole React tree. The action itself is
 * passed in (rather than imported here) so tests can supply a stub and so
 * `lib/recording/` stays free of `"use server"` imports / Next-only types.
 */

export type UploadAudioResult =
  | { ok: true; blobUrl: string; mimeType: string; sizeBytes: number }
  | { ok: false; error: string; debugId?: string };

export type UploadAudioFn = (
  studentId: string,
  formData: FormData
) => Promise<UploadAudioResult>;

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
  const runUpload = (): Promise<UploadAudioResult> => {
    const fd = new FormData();
    fd.append("file", new File([blob], filename, { type: mimeType }));
    return uploadFn(studentId, fd);
  };

  let result = await runUpload();
  if (!result.ok) {
    result = await runUpload();
  }
  return result;
}
