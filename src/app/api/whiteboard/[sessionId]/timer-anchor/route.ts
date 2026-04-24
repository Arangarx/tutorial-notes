import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";

/**
 * Returns the `bothConnectedAt` timestamp for a whiteboard session.
 *
 * GET /api/whiteboard/[sessionId]/timer-anchor
 *
 * Auth: admin session (same as /events and /snapshot).
 *
 * The tutor's workspace polls this every 5 s while bothConnectedAt is
 * null, then stops once it gets a value. This lets the live timer
 * anchor shift from "session started" to "student joined" without a
 * full page reload.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;

  await assertOwnsWhiteboardSession(sessionId);

  const row = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { bothConnectedAt: true },
      }),
    { label: "timerAnchor.findUnique" }
  );

  return NextResponse.json(
    { bothConnectedAt: row?.bothConnectedAt?.toISOString() ?? null },
    {
      headers: {
        // Short cache: the value starts null and flips once, so 3s is fine.
        "Cache-Control": "no-store",
      },
    }
  );
}
