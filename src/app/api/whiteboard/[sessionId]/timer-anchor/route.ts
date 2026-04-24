import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";

/**
 * Returns the live-timer state for a whiteboard session.
 *
 * GET /api/whiteboard/[sessionId]/timer-anchor
 *
 * Response shape:
 *   {
 *     bothConnectedAt: string | null,  // legacy "first overlap" anchor
 *     activeMs:        number,         // accumulated billable ms
 *     lastActiveAt:    string | null,  // server's last "still active" stamp
 *   }
 *
 * Auth: admin session (same as /events and /snapshot).
 *
 * The tutor's workspace fetches this on mount AND every ~30s after
 * to stay in sync with the server-truth billable timer (the heartbeat
 * route /active-ping is the writer; this is the reader).
 *
 * The legacy `bothConnectedAt` is kept in the response for
 * backwards compatibility with older clients still polling the v1
 * shape — the displayed timer now reads `activeMs` instead.
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
        select: {
          bothConnectedAt: true,
          activeMs: true,
          lastActiveAt: true,
        },
      }),
    { label: "timerAnchor.findUnique" }
  );

  return NextResponse.json(
    {
      bothConnectedAt: row?.bothConnectedAt?.toISOString() ?? null,
      activeMs: row?.activeMs ?? 0,
      lastActiveAt: row?.lastActiveAt?.toISOString() ?? null,
    },
    {
      headers: {
        // Per-tutor live values; never cache.
        "Cache-Control": "no-store",
      },
    }
  );
}
