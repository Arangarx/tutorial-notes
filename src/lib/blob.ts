import { del, head, getDownloadUrl } from "@vercel/blob";
import { env } from "@/lib/env";
export { ACCEPTED_AUDIO_TYPES, BLOB_MAX_BYTES, isAcceptedAudioType } from "@/lib/audio-constants";

/** Whether blob storage is configured (token present). */
export function isBlobConfigured(): boolean {
  return !!env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Delete a blob by URL. Swallows 404 (already deleted) but re-throws other errors.
 * Safe to call in cleanup paths where the blob may or may not exist.
 */
export async function deleteBlob(url: string): Promise<void> {
  try {
    await del(url);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      return;
    }
    throw err;
  }
}

/**
 * Returns a URL suitable for use in an <audio> element or for fetching bytes.
 * Audio blobs are stored with access:'public' at a UUID path — not guessable.
 * Adds ?download=1 for browser compatibility when used as a download link.
 */
export function getAudioUrl(blobUrl: string): string {
  return getDownloadUrl(blobUrl);
}

/**
 * Verify a blob URL is reachable and return its size in bytes.
 * Used after upload to confirm the blob landed before writing the DB row.
 */
export async function getBlobMetadata(
  blobUrl: string
): Promise<{ size: number; contentType: string }> {
  const metadata = await head(blobUrl);
  return { size: metadata.size, contentType: metadata.contentType };
}
