import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { createActionCorrelationId } from "@/lib/action-correlation";

/**
 * Share-token gated proxy for the whiteboard final-snapshot PNG.
 *
 * GET /api/whiteboard/[sessionId]/public-snapshot?token=<shareToken>
 *
 * Same trust model as public-events: valid ShareLink whose studentId
 * matches the session's studentId. Only ended sessions are accessible.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;
  const shareToken = new URL(req.url).searchParams.get("token");

  console.log(
    `[wbPublicSnapshot.route] GET wbsid=${sessionId} rid=${rid}`
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
    { label: "wbPublicSnapshot.route.shareLink" }
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
        select: {
          studentId: true,
          snapshotBlobUrl: true,
          endedAt: true,
        },
      }),
    { label: "wbPublicSnapshot.route.session" }
  );

  if (!session || session.studentId !== link.studentId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!session.endedAt) {
    return NextResponse.json(
      { error: "Session recording not yet available." },
      { status: 404 }
    );
  }
  if (!session.snapshotBlobUrl) {
    return NextResponse.json(
      { error: "No snapshot for this session." },
      { status: 404 }
    );
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const blobRes = await fetch(session.snapshotBlobUrl, {
    headers: blobToken ? { Authorization: `Bearer ${blobToken}` } : {},
  });

  if (!blobRes.ok) {
    console.error(
      `[wbPublicSnapshot.route] wbsid=${sessionId} rid=${rid} blob fetch ${blobRes.status}`
    );
    return NextResponse.json(
      { error: "Snapshot unavailable." },
      { status: 502 }
    );
  }

  console.log(`[wbPublicSnapshot.route] wbsid=${sessionId} rid=${rid} ok`);

  return new Response(blobRes.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
