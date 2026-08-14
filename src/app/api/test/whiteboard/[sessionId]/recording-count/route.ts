import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";

/**
 * Test-env-only helper for Playwright DB assertions (SF-7).
 * Returns SessionRecording row counts grouped by streamId.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;

  const { sessionId } = await ctx.params;
  const rows = await db.sessionRecording.findMany({
    where: { whiteboardSessionId: sessionId },
    select: { streamId: true, blobUrl: true },
  });

  const byStream: Record<string, number> = {};
  for (const row of rows) {
    byStream[row.streamId] = (byStream[row.streamId] ?? 0) + 1;
  }

  const blobUrls = rows.map((r) => r.blobUrl);
  const distinctBlobUrlCount = new Set(blobUrls).size;

  return NextResponse.json({
    count: rows.length,
    byStream,
    blobUrls,
    distinctBlobUrlCount,
  });
}
