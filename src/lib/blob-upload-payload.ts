/**
 * Client payload for Vercel Blob `handleUpload` token generation.
 *
 * Parsed from the `clientPayload` string passed through @vercel/blob/client's
 * generate-client-token flow. Canonical parse lives here — formerly duplicated
 * on `/api/upload/audio` (deleted) and `/api/upload/blob`.
 */

/**
 * `kind` is the discriminator that decides which ownership check fires
 * and which size + content-type policy applies.
 *
 *  - "audio" — tutor mic segments + Upload tab files.
 *  - "whiteboard-events" — the canonical event log JSON (`events.json`).
 *  - "whiteboard-snapshot" — final-canvas PNG thumbnail.
 *  - "whiteboard-asset" — assets inserted into the canvas (PDF pages, images, SVGs).
 */
export type UploadKind =
  | "audio"
  | "whiteboard-events"
  | "whiteboard-snapshot"
  | "whiteboard-asset";

export type ClientUploadPayload = {
  kind?: UploadKind;
  studentId?: string;
  whiteboardSessionId?: string;
  /**
   * When set (with kind `whiteboard-asset` only), authorizes a browser that is
   * *not* logged in as a tutor — the student join page — to upload the bytes
   * for pasted/dropped images. Must match a live `WhiteboardJoinToken`.
   */
  joinToken?: string;
  /** Optional asset slot (e.g. "pdf-page-3", "equation"); used only for log lines. */
  assetTag?: string;
};

/**
 * Parse the opaque `clientPayload` string from handleUpload into a typed object.
 * Returns null when missing, invalid JSON, or not a plain object.
 */
export function parseClientPayload(raw: string | null): ClientUploadPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as ClientUploadPayload;
    }
  } catch {
    // fall through
  }
  return null;
}
