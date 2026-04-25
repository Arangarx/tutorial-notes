import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { BLOB_MAX_BYTES } from "@/lib/audio-constants";
import { assertOwnsStudent } from "@/lib/student-scope";
import {
  assertJoinTokenAllowsWhiteboardAssetUpload,
  assertOwnsWhiteboardSession,
} from "@/lib/whiteboard-scope";
import { createActionCorrelationId } from "@/lib/action-correlation";

/**
 * Generalized client-direct Vercel Blob upload route.
 *
 * Supersedes `/api/upload/audio` (which still exists for backwards
 * compatibility with the audio recorder during the whiteboard rollout).
 * The whiteboard hook + replay player + PDF/image upload toolbar all
 * use THIS route.
 *
 * Auth model: every kind has a per-kind `onBeforeGenerateToken` gate
 * that loads the relevant ownership row (student, whiteboard session)
 * and throws if the logged-in tutor doesn't own it. Token issuance
 * is the actual gate — without a valid token signed for this
 * pathname, the PUT can't happen.
 *
 * Why one route handles every kind: `handleUpload` does the heavy
 * lifting (signed-token mint, content-type allow-list, size cap),
 * and we want exactly one place to keep up with @vercel/blob version
 * upgrades. The kind discriminator carries enough info to route to
 * the right ownership check + size cap + content-type allow-list.
 *
 * As with `/api/upload/audio`, we deliberately do NOT pass
 * `onUploadCompleted` — see that file's header for the local-dev
 * incompatibility this avoids.
 */

/**
 * `kind` is the discriminator that decides which ownership check fires
 * and which size + content-type policy applies.
 *
 *  - "audio" — backwards-compat path; same behaviour as
 *    `/api/upload/audio`. New audio uploads should still go through
 *    the dedicated route until we migrate the recorder. Kept here so
 *    the whiteboard recorder hook can also push audio segments through
 *    a single uploader without two routes.
 *  - "whiteboard-events" — the canonical event log JSON
 *    (`events.json`). Owned via WhiteboardSession.
 *  - "whiteboard-snapshot" — final-canvas PNG thumbnail. Owned via
 *    WhiteboardSession.
 *  - "whiteboard-asset" — assets the tutor inserts into the canvas
 *    (PDF page renders, raster images, math-equation SVGs). Owned via
 *    WhiteboardSession because they live in the session's namespace.
 */
export type UploadKind =
  | "audio"
  | "whiteboard-events"
  | "whiteboard-snapshot"
  | "whiteboard-asset";

type ClientUploadPayload = {
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

function parseClientPayload(raw: string | null): ClientUploadPayload | null {
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

const POLICY: Record<
  UploadKind,
  { allowed: string[]; maxBytes: number }
> = {
  audio: {
    allowed: ["audio/*"],
    maxBytes: BLOB_MAX_BYTES,
  },
  "whiteboard-events": {
    // Plain JSON. Cap at 10 MB even though the size budget is < 500 KB
    // (plan blocker #3) — the cap is a safety net, not the budget.
    allowed: ["application/json"],
    maxBytes: 10 * 1024 * 1024,
  },
  "whiteboard-snapshot": {
    allowed: ["image/png"],
    maxBytes: 5 * 1024 * 1024,
  },
  "whiteboard-asset": {
    // PDF-page renders (PNG), raster image inserts (PNG/JPEG/WEBP/GIF),
    // math equation renders (SVG). Cap per-asset at 25 MB to mirror the
    // PDF page-cap math (plan blocker #25 — 30 pages × ~1 MB/page).
    allowed: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"],
    maxBytes: 25 * 1024 * 1024,
  },
};

export async function POST(request: Request): Promise<Response> {
  const rid = createActionCorrelationId();

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    console.warn(`[uploadBlob.route] rid=${rid} invalid JSON body`);
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayloadRaw) => {
        const payload = parseClientPayload(clientPayloadRaw);
        const kind = payload?.kind;
        if (!kind || !(kind in POLICY)) {
          console.warn(
            `[uploadBlob.route] rid=${rid} unknown/missing kind=${String(kind)} pathname=${pathname}`
          );
          throw new Error("Missing or unknown upload kind.");
        }
        const policy = POLICY[kind];

        if (kind === "audio") {
          const studentId = payload?.studentId;
          if (!studentId || typeof studentId !== "string") {
            console.warn(
              `[uploadBlob.route] rid=${rid} audio kind missing studentId pathname=${pathname}`
            );
            throw new Error("Missing studentId in clientPayload.");
          }
          await assertOwnsStudent(studentId);
          console.log(
            `[uploadBlob.route] rid=${rid} kind=audio studentId=${studentId} pathname=${pathname}`
          );
          return {
            allowedContentTypes: policy.allowed,
            maximumSizeInBytes: policy.maxBytes,
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ kind, studentId, rid }),
          };
        }

        // All whiteboard-* kinds are scoped to a `WhiteboardSession` row. Tutor
        // (cookie session) uses `assertOwnsWhiteboardSession`. Student joiners
        // send `joinToken` for `whiteboard-asset` only.
        const whiteboardSessionId = payload?.whiteboardSessionId;
        if (!whiteboardSessionId || typeof whiteboardSessionId !== "string") {
          console.warn(
            `[uploadBlob.route] rid=${rid} kind=${kind} missing whiteboardSessionId pathname=${pathname}`
          );
          throw new Error("Missing whiteboardSessionId in clientPayload.");
        }
        let studentIdForToken: string;
        if (
          kind === "whiteboard-asset" &&
          payload?.joinToken &&
          typeof payload.joinToken === "string"
        ) {
          const { studentId } = await assertJoinTokenAllowsWhiteboardAssetUpload(
            payload.joinToken,
            whiteboardSessionId,
            pathname
          );
          studentIdForToken = studentId;
          console.log(
            `[uploadBlob.route] rid=${rid} kind=${kind} wbsid=${whiteboardSessionId} studentId=${studentIdForToken} joinToken=1 assetTag=${payload?.assetTag ?? "-"} pathname=${pathname}`
          );
        } else {
          if (payload?.joinToken) {
            throw new Error("joinToken is only valid for whiteboard-asset uploads.");
          }
          const session = await assertOwnsWhiteboardSession(whiteboardSessionId);
          studentIdForToken = session.studentId;
          console.log(
            `[uploadBlob.route] rid=${rid} kind=${kind} wbsid=${whiteboardSessionId} studentId=${studentIdForToken} assetTag=${payload?.assetTag ?? "-"} pathname=${pathname}`
          );
        }
        return {
          allowedContentTypes: policy.allowed,
          maximumSizeInBytes: policy.maxBytes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            kind,
            whiteboardSessionId,
            studentId: studentIdForToken,
            assetTag: payload?.assetTag,
            rid,
          }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[uploadBlob.route] rid=${rid} handleUpload threw:`, msg);
    return NextResponse.json({ error: msg, debugId: rid }, { status: 400 });
  }
}
