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
 * Why a proxy rather than a public Blob URL:
 *   - Whiteboard events may contain patient-identifying content (names
 *     the tutor writes; student first names in text elements, etc.).
 *   - The Blob is stored with `access: "public"` for CDN reachability
 *     from the tutor's browser, but we never surface that raw URL to
 *     anyone except the logged-in owner. The proxy keeps the URL
 *     opaque in all rendered HTML.
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
