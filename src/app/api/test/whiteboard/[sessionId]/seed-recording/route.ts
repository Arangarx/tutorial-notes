import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";

/**
 * Test-env-only: seed one SessionRecording row with a real Vercel Blob URL
 * (simulates WS-A A2 incremental register for WS-C finalize specs).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;

  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token?.trim()) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN not configured." },
      { status: 503 }
    );
  }

  const { sessionId } = await ctx.params;
  const session = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: { id: true, adminUserId: true, studentId: true, endedAt: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.endedAt) {
    return NextResponse.json({ error: "Session already ended." }, { status: 409 });
  }

  const tinyWebm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const blobResult = await put(
    `sessions/${session.studentId}/e2e-seed-${sessionId.slice(0, 8)}.webm`,
    tinyWebm,
    { access: "private", token: token.trim() }
  );

  const maxOrder = await db.sessionRecording.aggregate({
    where: { whiteboardSessionId: sessionId },
    _max: { orderIndex: true },
  });
  const orderIndex = (maxOrder._max.orderIndex ?? -1) + 1;

  const row = await db.sessionRecording.create({
    data: {
      adminUserId: session.adminUserId,
      studentId: session.studentId,
      whiteboardSessionId: sessionId,
      blobUrl: blobResult.url,
      mimeType: "audio/webm",
      sizeBytes: tinyWebm.byteLength,
      orderIndex,
      streamId: "tutor:mic",
    },
    select: { id: true, orderIndex: true, blobUrl: true },
  });

  return NextResponse.json({
    ok: true,
    recordingId: row.id,
    orderIndex: row.orderIndex,
    blobUrl: row.blobUrl,
  });
}
