import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ACCEPTED_AUDIO_TYPES, BLOB_MAX_BYTES } from "@/lib/audio-constants";
import { assertOwnsStudent } from "@/lib/student-scope";
import { createActionCorrelationId } from "@/lib/action-correlation";

/**
 * Client-direct Vercel Blob upload route.
 *
 * Why this exists: the previous flow (uploadAudioAction server action)
 * routed every audio blob through a Vercel server function, which caps
 * request bodies at 4.5MB. Sarah hit that ceiling uploading a 17.9MB,
 * ~30-minute m4a file from her phone and got a generic "unexpected
 * response from the server" error. With handleUpload + the client-side
 * upload() helper, the browser PUTs straight to Vercel Blob and our
 * function only sees a tiny token-mint request, so the size cap is
 * effectively the BLOB_MAX_BYTES constant we set ourselves (100MB
 * today; can grow to 5TB).
 *
 * Token-mint only — no completion callback. We deliberately do NOT
 * pass onUploadCompleted to handleUpload, for two reasons:
 *
 *  1. We don't need it. The recording row is written by the caller
 *     (recorder hook / Upload tab) once the client side learns the
 *     final blob URL from upload()'s return value, then a separate
 *     server action (createRecording / transcribeAndGenerate) writes
 *     the DB row. There is nothing to do in onUploadCompleted.
 *
 *  2. It breaks local dev. When onUploadCompleted is present, Vercel's
 *     handleUpload tries to embed a callbackUrl in the signed client
 *     token. On localhost (no VERCEL=1 and no VERCEL_BLOB_CALLBACK_URL),
 *     getCallbackUrl() returns undefined and the token is signed with
 *     onUploadCompleted: undefined. Vercel's edge then 400s the PUT
 *     because the token / request handshake doesn't reconcile cleanly.
 *     Removing the callback altogether sidesteps this — local dev,
 *     preview, and prod all behave the same way.
 *
 * If we ever need post-upload server-side work (virus scan, transcode,
 * size accounting), reintroduce onUploadCompleted AND set
 * VERCEL_BLOB_CALLBACK_URL to a tunnel URL (ngrok / cloudflared) when
 * developing locally.
 *
 * Auth model: ownership check happens inside onBeforeGenerateToken.
 * Token issuance is the actual gate — without a valid token signed for
 * this pathname, the PUT can't happen.
 */

type ClientUploadPayload = {
  studentId?: string;
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

export async function POST(request: Request): Promise<Response> {
  const rid = createActionCorrelationId();

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    console.warn(`[uploadAudio.route] rid=${rid} invalid JSON body`);
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayloadRaw) => {
        const payload = parseClientPayload(clientPayloadRaw);
        const studentId = payload?.studentId;
        if (!studentId || typeof studentId !== "string") {
          console.warn(
            `[uploadAudio.route] rid=${rid} missing studentId in clientPayload pathname=${pathname}`
          );
          throw new Error("Missing studentId in clientPayload.");
        }

        // assertOwnsStudent calls notFound() / redirect() internally on
        // failure — both throw, which handleUpload turns into a 4xx
        // response on the client. The tutor sees our user-facing copy
        // surfaced by uploadAudioDirect's catch path.
        await assertOwnsStudent(studentId);

        return {
          allowedContentTypes: [...ACCEPTED_AUDIO_TYPES],
          maximumSizeInBytes: BLOB_MAX_BYTES,
          // Random suffix on the pathname so two recordings with the
          // same filename can't collide and so the URL isn't enumerable
          // from the studentId alone.
          addRandomSuffix: true,
          // tokenPayload is round-tripped back to onUploadCompleted,
          // which we don't use (see file header). It's still useful as
          // an audit trail in the signed token blob itself, so we keep
          // studentId + rid here for any future debugging.
          tokenPayload: JSON.stringify({ studentId, rid }),
        };
      },
      // No onUploadCompleted — see file header for why. Removing this
      // makes local dev work and removes a moving part in prod.
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[uploadAudio.route] rid=${rid} handleUpload threw:`, msg);
    // 400 here surfaces as a thrown error on the client side — see
    // uploadAudioDirect for how it maps to a user-facing message.
    return NextResponse.json({ error: msg, debugId: rid }, { status: 400 });
  }
}
