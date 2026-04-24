import { NextResponse } from "next/server";
import { createActionCorrelationId } from "@/lib/action-correlation";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";

/**
 * Proxy the whiteboard event log (JSON) from Vercel Blob to the
 * authenticated tutor browser.
 *
 * GET /api/whiteboard/[sessionId]/events
 *
 * Auth: admin session only — same ownership check as every other
 * whiteboard server action. The events blob was recorded with
 * `credentials: "omit"` in the replay player, which means it needs
 * the tutor to be logged in and this route to proxy the content.
 *
 * Why a proxy rather than a direct Blob URL:
 *   - Whiteboard events may contain student-identifying content
 *     (names the tutor writes; student first names in text elements).
 *   - The Blob is stored with `access: "private"` so the raw URL
 *     returns 403 without a Bearer token. This route fetches with
 *     BLOB_READ_WRITE_TOKEN server-side and streams the bytes back,
 *     so the URL is never directly reachable from the browser.
 *
 * wbsid= logging: mirrors `rid=` from the audio routes so every
 * event-log download appears in the observability log.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;

  console.log(
    `[wbEvents.route] GET wbsid=${sessionId} rid=${rid}`
  );

  // Ownership check — calls notFound() on miss (doesn't leak existence).
  const session = await assertOwnsWhiteboardSession(sessionId);

  // A session that hasn't ended yet still has a valid eventsBlobUrl
  // if the tutor did an early Stop. Don't gate on endedAt — the admin
  // review page can call this endpoint for any session that has a
  // URL.
  if (!session.eventsBlobUrl) {
    console.warn(
      `[wbEvents.route] wbsid=${sessionId} rid=${rid} no eventsBlobUrl`
    );
    return NextResponse.json(
      { error: "No event log recorded for this session." },
      { status: 404 }
    );
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const blobRes = await fetch(session.eventsBlobUrl, {
    headers: blobToken ? { Authorization: `Bearer ${blobToken}` } : {},
  });

  if (!blobRes.ok) {
    console.error(
      `[wbEvents.route] wbsid=${sessionId} rid=${rid} blob fetch ${blobRes.status}`
    );
    return NextResponse.json(
      { error: "Event log unavailable." },
      { status: 502 }
    );
  }

  // Validate the upstream actually returned JSON before streaming
  // through. Reasons this matters in practice:
  //
  //   - Vercel Blob can return a 200 HTML "your token is wrong /
  //     this object isn't here anymore" page in certain auth-misconfig
  //     edge cases. Streaming that body with `Content-Type:
  //     application/json` causes the browser to JSON.parse `<!DOCTYPE`
  //     and the player surfaces "Unexpected token '<'" to the tutor.
  //   - A future migration that swaps storage backends could yield
  //     200 responses with a different content type.
  //
  // We trust ".startsWith('application/json')" because the writer
  // path (createWhiteboardSession + useWhiteboardRecorder) ALWAYS
  // sets contentType: "application/json". Any other content type
  // here is a sign the URL doesn't point at our event-log object —
  // surface a clean 502 instead of poisoning the player.
  const upstreamCt = blobRes.headers.get("Content-Type") ?? "";
  if (!upstreamCt.toLowerCase().startsWith("application/json")) {
    console.error(
      `[wbEvents.route] wbsid=${sessionId} rid=${rid} blob returned non-JSON content-type=${upstreamCt}`
    );
    return NextResponse.json(
      {
        error:
          "The recording for this session is in an unexpected format and cannot be replayed.",
      },
      { status: 502 }
    );
  }

  const sizeHint = blobRes.headers.get("Content-Length") ?? "?";
  console.log(
    `[wbEvents.route] wbsid=${sessionId} rid=${rid} bytes=${sizeHint} ok`
  );

  return new Response(blobRes.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Cache 5 min for the finished-session case; no-store for
      // in-progress sessions where the tutor might be re-reviewing
      // an early checkpoint.
      "Cache-Control": session.endedAt
        ? "private, max-age=300"
        : "no-store",
    },
  });
}
