import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";

/**
 * Read-only live timer for the anonymous student join page.
 *
 * GET /api/whiteboard/[sessionId]/join-timer?token=<joinToken>
 *
 * Auth: the join token in the query string. Same gate as `GET /w/[token]`.
 * The logged-in timer-anchor route is tutor-only; this exists so the
 * student can display the same billable clock without a session cookie.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { error: "Query parameter 'token' is required." },
      { status: 400 }
    );
  }

  const now = new Date();
  const tokenRow = await withDbRetry(
    () =>
      db.whiteboardJoinToken.findUnique({
        where: { token },
        select: {
          whiteboardSessionId: true,
          expiresAt: true,
          revokedAt: true,
          whiteboardSession: { select: { id: true, endedAt: true } },
        },
      }),
    { label: "joinTimer.findToken" }
  );

  if (!tokenRow) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (tokenRow.whiteboardSessionId !== sessionId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (tokenRow.revokedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (tokenRow.expiresAt.getTime() <= now.getTime()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (tokenRow.whiteboardSession?.endedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const row = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { activeMs: true, lastActiveAt: true },
      }),
    { label: "joinTimer.findSession" }
  );

  return NextResponse.json(
    {
      activeMs: row?.activeMs ?? 0,
      lastActiveAt: row?.lastActiveAt?.toISOString() ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
