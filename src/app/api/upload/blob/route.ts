import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import {
  handleHarnessBlobGenerateClientToken,
  isBlobHarnessActive,
} from "@/lib/blob-harness";
import { BLOB_MAX_BYTES } from "@/lib/audio-constants";
import { assertOwnsStudent, requireStudentScope } from "@/lib/student-scope";
import { assertStudentNotErased } from "@/lib/erasure/assert-student-not-erased";
import {
  assertJoinTokenAllowsWhiteboardAssetUpload,
  assertLearnerSessionAllowsWhiteboardAssetUpload,
  assertOwnsWhiteboardSession,
} from "@/lib/whiteboard-scope";
import { getLearnerSession } from "@/lib/learner-session";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { createActionCorrelationId } from "@/lib/action-correlation";
import { assertTutorApproved } from "@/lib/tutor-approval-scope";
import { resolveAhJoinLearnerProfileId } from "@/lib/join-scope";
import {
  parseClientPayload,
  type UploadKind,
} from "@/lib/blob-upload-payload";

/**
 * Canonical client-direct Vercel Blob upload route.
 *
 * Handles every upload kind (audio segments, whiteboard events/snapshots/
 * assets) through one handleUpload handler so auth policy and
 * @vercel/blob upgrades stay in one place.
 *
 * Auth model: every kind has a per-kind `onBeforeGenerateToken` gate
 * that loads the relevant ownership row (student, whiteboard session)
 * and throws if the logged-in tutor doesn't own it. Token issuance
 * is the actual gate — without a valid token signed for this
 * pathname, the PUT can't happen.
 *
 * We deliberately do NOT pass `onUploadCompleted` — embedding a
 * callback URL in the signed token breaks localhost dev when no
 * VERCEL_BLOB_CALLBACK_URL is configured (see upload-route-no-callback
 * regression test).
 */

/**
 * `kind` is the discriminator that decides which ownership check fires
 * and which size + content-type policy applies.
 *
 *  - "audio" — tutor mic segments + Upload tab files. Same auth as
 *    the former `/api/upload/audio` route (ownership, erasure, tutor
 *    approval). Client: `uploadAudioDirect` in lib/recording/upload.ts.
 *  - "whiteboard-events" — the canonical event log JSON
 *    (`events.json`). Owned via WhiteboardSession.
 *  - "whiteboard-snapshot" — final-canvas PNG thumbnail. Owned via
 *    WhiteboardSession.
 *  - "whiteboard-asset" — assets the tutor inserts into the canvas
 *    (PDF page renders, raster images, math-equation SVGs). Owned via
 *    WhiteboardSession because they live in the session's namespace.
 */
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

  const runOnBeforeGenerateToken = async (
    pathname: string,
    clientPayloadRaw: string | null
  ) => {
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
          await assertStudentNotErased(studentId);
          // B1 cost gate: WAITLISTED tutors cannot upload audio blobs.
          const audioBlobScope = await requireStudentScope();
          if (audioBlobScope.kind === "admin") {
            await assertTutorApproved(audioBlobScope.adminId);
          }
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
          // Token auth: legacy anonymous /w/[joinToken] path (kept for in-flight old links).
          const { studentId } = await assertJoinTokenAllowsWhiteboardAssetUpload(
            payload.joinToken,
            whiteboardSessionId,
            pathname
          );
          studentIdForToken = studentId;
          console.log(
            `[uploadBlob.route] rid=${rid} kind=${kind} wbsid=${whiteboardSessionId} studentId=${studentIdForToken} joinToken=1 assetTag=${payload?.assetTag ?? "-"} pathname=${pathname}`
          );
        } else if (kind === "whiteboard-asset") {
          // Learner-session auth: authenticated /join/[sessionId] path.
          // Accepts learner session OR account-holder session for a self-learner
          // (WB-JOIN-ADULT-LEARNER). If either principal is present, authorize
          // via the participant gate. Otherwise fall through to tutor ownership.
          const learnerSession = await getLearnerSession(request);
          let learnerProfileIdForUpload: string | null =
            learnerSession?.learnerProfileId ?? null;
          if (!learnerProfileIdForUpload) {
            const ahSession = await getAccountHolderSession(request);
            if (ahSession) {
              const resolved = await resolveAhJoinLearnerProfileId(
                whiteboardSessionId,
                ahSession.accountHolderId
              );
              if (resolved) learnerProfileIdForUpload = resolved.learnerProfileId;
            }
          }
          if (learnerProfileIdForUpload) {
            const { studentId } = await assertLearnerSessionAllowsWhiteboardAssetUpload(
              learnerProfileIdForUpload,
              whiteboardSessionId,
              pathname
            );
            studentIdForToken = studentId;
            console.log(
              `[uploadBlob.route] rid=${rid} kind=${kind} wbsid=${whiteboardSessionId} studentId=${studentIdForToken} learnerAuth=1 assetTag=${payload?.assetTag ?? "-"} pathname=${pathname}`
            );
          } else {
            // Tutor auth (no learner session, no joinToken).
            if (payload?.joinToken) {
              throw new Error("joinToken is only valid for whiteboard-asset uploads.");
            }
            const session = await assertOwnsWhiteboardSession(whiteboardSessionId);
            studentIdForToken = session.studentId;
            // B1 cost gate: WAITLISTED tutors cannot upload whiteboard blobs.
            await assertTutorApproved(session.adminUserId);
            console.log(
              `[uploadBlob.route] rid=${rid} kind=${kind} wbsid=${whiteboardSessionId} studentId=${studentIdForToken} assetTag=${payload?.assetTag ?? "-"} pathname=${pathname}`
            );
          }
        } else {
          if (payload?.joinToken) {
            throw new Error("joinToken is only valid for whiteboard-asset uploads.");
          }
          const session = await assertOwnsWhiteboardSession(whiteboardSessionId);
          studentIdForToken = session.studentId;
          // B1 cost gate: WAITLISTED tutors cannot upload whiteboard blobs.
          await assertTutorApproved(session.adminUserId);
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
  };

  try {
    if (
      isBlobHarnessActive() &&
      body.type === "blob.generate-client-token"
    ) {
      const harnessResponse = await handleHarnessBlobGenerateClientToken(
        request,
        body,
        (pathname, clientPayloadRaw, multipart) =>
          runOnBeforeGenerateToken(pathname, clientPayloadRaw)
      );
      return NextResponse.json(harnessResponse);
    }

    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: runOnBeforeGenerateToken,
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[uploadBlob.route] rid=${rid} handleUpload threw:`, msg);
    return NextResponse.json(
      { error: "Upload authorization failed. Please try again.", debugId: rid },
      { status: 400 }
    );
  }
}
