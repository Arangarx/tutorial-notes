import { NextResponse } from "next/server";
import { createActionCorrelationId } from "@/lib/action-correlation";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { db, withDbRetry } from "@/lib/db";

/**
 * Proxy the whiteboard final-snapshot PNG from Vercel Blob to the
 * authenticated tutor browser.
 *
 * GET /api/whiteboard/[sessionId]/snapshot
 *
 * Auth: admin session only. Same pattern as /events above.
 *
 * The snapshot is optional — `exportToBlob` is best-effort on Stop
 * and can fail (iOS Safari memory pressure, race with tab unload).
 * This route returns 404 if `snapshotBlobUrl` is null rather than
 * 502, so the replay page can gracefully hide the snapshot link.
 *
 * Why a separate route from /events:
 *   - Different Content-Type (image/png vs application/json).
 *   - Different cache policy (images cache longer; they don't change
 *     after Stop).
 *   - Separate observability log lines (`wbSnapshot.route` vs
 *     `wbEvents.route`) so we can see if one fails without the other.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;

  console.log(
    `[wbSnapshot.route] GET wbsid=${sessionId} rid=${rid}`
  );

  // Ownership check.
  await assertOwnsWhiteboardSession(sessionId);

  // assertOwnsWhiteboardSession doesn't return snapshotBlobUrl, so we
  // do a targeted query for that column.
  const row = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { snapshotBlobUrl: true, endedAt: true },
      }),
    { label: "wbSnapshot.route.findUnique" }
  );

  if (!row?.snapshotBlobUrl) {
    console.log(
      `[wbSnapshot.route] wbsid=${sessionId} rid=${rid} no snapshotBlobUrl`
    );
    return NextResponse.json(
      { error: "No snapshot for this session." },
      { status: 404 }
    );
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const blobRes = await fetch(row.snapshotBlobUrl, {
    headers: blobToken ? { Authorization: `Bearer ${blobToken}` } : {},
  });

  if (!blobRes.ok) {
    console.error(
      `[wbSnapshot.route] wbsid=${sessionId} rid=${rid} blob fetch ${blobRes.status}`
    );
    return NextResponse.json(
      { error: "Snapshot unavailable." },
      { status: 502 }
    );
  }

  console.log(`[wbSnapshot.route] wbsid=${sessionId} rid=${rid} ok`);

  return new Response(blobRes.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      // Snapshot is final once the session ends — safe to cache.
      "Cache-Control": row.endedAt
        ? "private, max-age=3600"
        : "no-store",
    },
  });
}
