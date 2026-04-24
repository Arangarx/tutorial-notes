import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { createActionCorrelationId } from "@/lib/action-correlation";

/**
 * Share-token gated proxy for the whiteboard event log.
 *
 * GET /api/whiteboard/[sessionId]/public-events?token=<shareToken>
 *
 * Auth: the caller must hold a valid, non-revoked `ShareLink` token
 * whose `studentId` matches the `WhiteboardSession.studentId`.
 * Same trust pattern as `/api/audio/[recordingId]?token=`.
 *
 * Only ended sessions are accessible — we never expose a live in-
 * progress session's event stream on the public share surface.
 *
 * wbsid= logging mirrors the admin events route so share-page
 * event-log fetches appear in the observability log.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;
  const shareToken = new URL(req.url).searchParams.get("token");

  console.log(
    `[wbPublicEvents.route] GET wbsid=${sessionId} rid=${rid}`
  );

  if (!shareToken) {
    return NextResponse.json({ error: "Missing token." }, { status: 401 });
  }

  const link = await withDbRetry(
    () =>
      db.shareLink.findUnique({
        where: { token: shareToken },
        select: { revokedAt: true, studentId: true },
      }),
    { label: "wbPublicEvents.route.shareLink" }
  );
  if (!link || link.revokedAt) {
    return NextResponse.json(
      { error: "Invalid or expired link." },
      { status: 403 }
    );
  }

  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { studentId: true, eventsBlobUrl: true, endedAt: true },
      }),
    { label: "wbPublicEvents.route.session" }
  );

  if (!session || session.studentId !== link.studentId) {
    // Don't leak existence — 404.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!session.endedAt) {
    // Live session: not exposed on the public surface.
    return NextResponse.json(
      { error: "Session recording not yet available." },
      { status: 404 }
    );
  }

  if (!session.eventsBlobUrl) {
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
      `[wbPublicEvents.route] wbsid=${sessionId} rid=${rid} blob fetch ${blobRes.status}`
    );
    return NextResponse.json(
      { error: "Event log unavailable." },
      { status: 502 }
    );
  }

  console.log(`[wbPublicEvents.route] wbsid=${sessionId} rid=${rid} ok`);

  return new Response(blobRes.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=300",
    },
  });
}
