"use client";

/**
 * Whiteboard blob upload helpers — one entry-point per `UploadKind`
 * served by `/api/upload/blob`.
 *
 * Mirrors `uploadAudioDirect` in `src/lib/recording/upload.ts`. We
 * keep them separate so a future tweak to one (retry policy, content-
 * type quirks) doesn't accidentally regress the other. Both go
 * through the same `handleUpload` route and share its auth gate.
 */

export type WhiteboardUploadResult =
  | { ok: true; blobUrl: string; sizeBytes: number }
  | { ok: false; error: string };

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || "blob.bin";
}

const TOKEN_RETRYABLE =
  /client token|Failed to retrieve|token|rate|limit|5\d\d|network|fetch|timeout|AbortError/i;

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadGeneric(
  pathname: string,
  blob: Blob,
  contentType: string,
  clientPayload: Record<string, unknown> & { joinToken?: string }
): Promise<WhiteboardUploadResult> {
  const { upload } = await import("@vercel/blob/client");
  // Long PDF runs issue many back-to-back token requests; Vercel can
  // occasionally fail a single "retrieve the client token" call — retry
  // with light backoff (same path as the audio uploader’s resilience).
  const backoffs = [0, 400, 1_200];
  let lastRaw = "Unknown error";
  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    if (backoffs[attempt]! > 0) {
      await sleepMs(backoffs[attempt]!);
    }
    try {
      const result = await upload(pathname, blob, {
        access: "private",
        handleUploadUrl: "/api/upload/blob",
        contentType,
        clientPayload: JSON.stringify(clientPayload),
      });
      return { ok: true, blobUrl: result.url, sizeBytes: blob.size };
    } catch (err) {
      lastRaw = err instanceof Error ? err.message : String(err);
      const retry = attempt < backoffs.length - 1 && TOKEN_RETRYABLE.test(lastRaw);
      if (typeof console !== "undefined" && !retry) {
        console.error("[whiteboard.upload] upload failed", {
          pathname,
          contentType,
          sizeBytes: blob.size,
          rawError: lastRaw,
          attempt,
        });
      } else if (typeof console !== "undefined" && retry) {
        console.warn("[whiteboard.upload] retrying after token/client error", {
          attempt: attempt + 1,
          rawError: lastRaw,
        });
      }
      if (!retry) {
        return {
          ok: false,
          error: `Could not upload to whiteboard storage. Please try again. (${lastRaw})`,
        };
      }
    }
  }
  return {
    ok: false,
    error: `Could not upload to whiteboard storage. Please try again. (${lastRaw})`,
  };
}

/**
 * Upload the canonical event log (events.json) at end-of-session.
 *
 * Pathname includes the studentId + sessionId for traceability and so
 * a future cleanup sweep can list-and-delete by prefix. Random suffix
 * is added by the route's `addRandomSuffix: true` so two simultaneous
 * uploads don't collide.
 */
export async function uploadWhiteboardEvents(args: {
  whiteboardSessionId: string;
  studentId: string;
  eventsJson: string;
}): Promise<WhiteboardUploadResult> {
  const { whiteboardSessionId, studentId, eventsJson } = args;
  const blob = new Blob([eventsJson], { type: "application/json" });
  const pathname = `whiteboard-sessions/${studentId}/${whiteboardSessionId}/${Date.now()}-events.json`;
  return uploadGeneric(pathname, blob, "application/json", {
    kind: "whiteboard-events",
    whiteboardSessionId,
  });
}

/**
 * Upload an end-of-session canvas snapshot PNG. Optional — the session
 * survives without it; we use it for thumbnails on the admin index.
 */
export async function uploadWhiteboardSnapshot(args: {
  whiteboardSessionId: string;
  studentId: string;
  png: Blob;
}): Promise<WhiteboardUploadResult> {
  const { whiteboardSessionId, studentId, png } = args;
  const pathname = `whiteboard-sessions/${studentId}/${whiteboardSessionId}/${Date.now()}-snapshot.png`;
  return uploadGeneric(pathname, png, "image/png", {
    kind: "whiteboard-snapshot",
    whiteboardSessionId,
  });
}

/**
 * Upload an inserted asset (PDF page render, raster image, math SVG).
 * `assetTag` is included in server log lines for traceability.
 */
export async function uploadWhiteboardAsset(args: {
  whiteboardSessionId: string;
  studentId: string;
  blob: Blob;
  filename: string;
  contentType: string;
  assetTag?: string;
  /**
   * Student join page: authenticate the Vercel Blob token via the same
   * `WhiteboardJoinToken` the student used to open `/w/...` (no tutor cookie).
   */
  joinToken?: string;
}): Promise<WhiteboardUploadResult> {
  const {
    whiteboardSessionId,
    studentId,
    blob,
    filename,
    contentType,
    assetTag,
    joinToken,
  } = args;
  const pathname = `whiteboard-sessions/${studentId}/${whiteboardSessionId}/assets/${Date.now()}-${safeName(filename)}`;
  return uploadGeneric(pathname, blob, contentType, {
    kind: "whiteboard-asset",
    whiteboardSessionId,
    assetTag,
    ...(joinToken ? { joinToken } : {}),
  });
}
