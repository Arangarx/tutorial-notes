import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueNotesReduce } from "@/lib/recording/notes-enqueue";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";

/**
 * Test-env-only: seal session + enqueue notes reduce without audio drain.
 *
 * Fake-mic End uploads corrupt WebM that Whisper marks failed — that blocks
 * the WS-K finalize fast-path (isPartial). This route mirrors the notes
 * pipeline trigger End would fire once chunks are settled, without polluting
 * TranscriptChunk rows.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;

  const { sessionId } = await ctx.params;

  const session = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: { id: true, endedAt: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const sealedAt = session.endedAt ?? new Date();
  if (!session.endedAt) {
    await db.whiteboardSession.update({
      where: { id: sessionId },
      data: { endedAt: sealedAt },
    });
  }

  await enqueueNotesReduce(sessionId);

  return NextResponse.json({
    ok: true,
    sealedAt: sealedAt.toISOString(),
  });
}
