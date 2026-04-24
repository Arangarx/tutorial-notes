import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { createActionCorrelationId } from "@/lib/action-correlation";
import {
  ACTIVE_PING_STALE_MS,
  computeActivePingUpdate,
} from "@/lib/whiteboard/active-time";

/**
 * Wyzant-style billable-timer heartbeat for the live whiteboard.
 *
 * POST /api/whiteboard/[sessionId]/active-ping
 *   body: { active: boolean }
 *
 * Sarah's expectation (Apr 2026): "the timer should pause when the
 * student isn't there." The displayed timer in the workspace reads
 * `WhiteboardSession.activeMs` (server-truth), so the workspace POSTs
 * here every few seconds with `active=true` while peerCount >= 1, and
 * once with `active=false` when the student drops, the tutor closes
 * the tab, etc.
 *
 * Stale-gap accounting: the server adds (now - lastActiveAt) to
 * activeMs ONLY when the gap is below ACTIVE_PING_STALE_MS. Bigger
 * gaps mean the workspace was unreachable (tab closed, network out)
 * — billing continuously through that window would re-introduce the
 * exact bug we're fixing. Instead, on the first new ping we just
 * stamp lastActiveAt and start a fresh segment.
 *
 * Trust posture:
 *   - assertOwnsWhiteboardSession gates ownership (multi-tenant).
 *   - We refuse to update sessions that have already ended — the
 *     final activeMs is whatever was persisted before End.
 *   - The student page does NOT call this route. The student is
 *     anonymous; only the tutor's logged-in workspace is the source
 *     of truth for billable time.
 */

type ActivePingBody = { active: boolean };

function parseBody(raw: unknown): ActivePingBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ActivePingBody>;
  if (typeof r.active !== "boolean") return null;
  return { active: r.active };
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;

  // Body parse first — cheaper than the auth round-trip if malformed.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    // navigator.sendBeacon() sends a Blob with no JSON content-type
    // negotiation; tolerate empty body as `active: false` so the
    // unload beacon path doesn't fail closed.
    raw = { active: false };
  }
  const parsed = parseBody(raw);
  if (!parsed) {
    return NextResponse.json(
      { error: "Body must be { active: boolean }." },
      { status: 400 }
    );
  }

  const session = await assertOwnsWhiteboardSession(sessionId);
  if (session.endedAt) {
    return NextResponse.json(
      { error: "Session already ended.", debugId: rid },
      { status: 409 }
    );
  }

  const now = new Date();
  // Read current state — we need lastActiveAt + activeMs to compute the
  // delta for this ping. A single short transaction would be ideal but
  // Neon serverless is fine with read-then-write on the same row at
  // our cadence (≤ 1 ping/10s/tutor).
  const before = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: {
          activeMs: true,
          lastActiveAt: true,
          bothConnectedAt: true,
        },
      }),
    { label: "activePing.read" }
  );
  if (!before) {
    return NextResponse.json(
      { error: "Session not found.", debugId: rid },
      { status: 404 }
    );
  }

  const update = computeActivePingUpdate({
    nowMs: now.getTime(),
    active: parsed.active,
    prevActiveMs: before.activeMs,
    prevLastActiveAtMs: before.lastActiveAt?.getTime() ?? null,
    prevBothConnectedAtMs: before.bothConnectedAt?.getTime() ?? null,
    staleThresholdMs: ACTIVE_PING_STALE_MS,
  });

  const written = await withDbRetry(
    () =>
      db.whiteboardSession.update({
        where: { id: sessionId },
        data: {
          activeMs: update.activeMs,
          // Use Date | null so `lastActiveAt = null` actually clears
          // the column on `active=false` pings.
          lastActiveAt:
            update.lastActiveAtMs === null
              ? null
              : new Date(update.lastActiveAtMs),
          // Stamp bothConnectedAt the first time we see a positive
          // ping that wasn't already stamped — keeps the legacy field
          // populated so existing review surfaces still know "when
          // did the student first show up".
          ...(update.bothConnectedAtMs !== null &&
          before.bothConnectedAt === null
            ? { bothConnectedAt: new Date(update.bothConnectedAtMs) }
            : {}),
        },
        select: {
          activeMs: true,
          lastActiveAt: true,
          bothConnectedAt: true,
        },
      }),
    { label: "activePing.write" }
  );

  return NextResponse.json(
    {
      ok: true,
      activeMs: written.activeMs,
      lastActiveAt: written.lastActiveAt?.toISOString() ?? null,
      bothConnectedAt: written.bothConnectedAt?.toISOString() ?? null,
      debugId: rid,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
