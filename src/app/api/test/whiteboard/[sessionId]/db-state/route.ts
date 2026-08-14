import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";

/**
 * Test-env-only helper for Playwright WS-B batch assertions (SF-6).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;

  const { sessionId } = await ctx.params;

  const [batchCount, session, latestBatch] = await Promise.all([
    db.whiteboardEventBatch.count({
      where: { whiteboardSessionId: sessionId },
    }),
    db.whiteboardSession.findUnique({
      where: { id: sessionId },
      select: {
        lastPersistedBatchSeq: true,
        lastPersistedToIndex: true,
        endedAt: true,
        eventsBlobUrl: true,
      },
    }),
    db.whiteboardEventBatch.findFirst({
      where: { whiteboardSessionId: sessionId },
      orderBy: { toEventIndex: "desc" },
      select: { toEventIndex: true },
    }),
  ]);

  return NextResponse.json({
    batchCount,
    lastPersistedBatchSeq: session?.lastPersistedBatchSeq ?? 0,
    lastPersistedToIndex: session?.lastPersistedToIndex ?? -1,
    latestToEventIndex: latestBatch?.toEventIndex ?? null,
    endedAt: session?.endedAt?.toISOString() ?? null,
    eventsBlobUrl: session?.eventsBlobUrl ?? null,
  });
}
