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
 * Two phases use this single endpoint:
 *  1. blob.generate-client-token — issued before the upload starts. We
 *     verify the tutor is signed in and owns the studentId in the
 *     clientPayload, then sign a token constrained to audio mime types
 *     and the max-size cap.
 *  2. blob.upload-completed — issued by Vercel Blob's edge after the
 *     client PUT lands. We just log it; the recording row is written by
 *     the caller (recorder/upload tab) once the client side learns the
 *     final blob URL.
 *
 * Auth model: ownership check happens inside onBeforeGenerateToken, NOT
 * onUploadCompleted. The completion callback is called by Vercel Blob,
 * not by our user, so we can't recheck the session there. This is fine
 * because token issuance is the actual gate — without a valid token
 * signed for this pathname, the PUT can't happen.
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
          // Round-trip the studentId so onUploadCompleted has it for
          // logging without re-parsing the original payload.
          tokenPayload: JSON.stringify({ studentId, rid }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Vercel Blob's edge calls this after the client PUT lands. The
        // recording row is written by the caller once it learns the URL,
        // so all we do here is log for debugging. Failures here would
        // surface as a 5xx to Vercel Blob (it doesn't retry), but since
        // we don't write any DB rows there's nothing to fail.
        try {
          const meta = tokenPayload ? (JSON.parse(tokenPayload) as { studentId?: string; rid?: string }) : null;
          console.log(
            `[uploadAudio.route] upload-completed rid=${meta?.rid ?? "?"} studentId=${meta?.studentId ?? "?"} url=${blob.url} size=${blob.contentDisposition}`
          );
        } catch {
          console.log(`[uploadAudio.route] upload-completed url=${blob.url}`);
        }
      },
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
