import { NextResponse } from "next/server";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";

/**
 * Lightweight read for the tutor workspace: has this whiteboard session
 * been ended on the server?
 *
 * GET /api/whiteboard/[sessionId]/session-ended
 *   → { ended: boolean }
 *
 * Used by `useWhiteboardRecorder` to drop stale IndexedDB checkpoints
 * after the tutor ends sessions from the student page (or the
 * resume-gate action) without opening each workspace — otherwise the
 * client would still show "Found an unsaved session…" from local
 * recovery even though every `WhiteboardSession` row has `endedAt`
 * set (Apr 2026 pilot confusion).
 *
 * Auth: `assertOwnsWhiteboardSession` (same multi-tenant gate as
 * timer-anchor / active-ping).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;
  const session = await assertOwnsWhiteboardSession(sessionId);
  return NextResponse.json({ ended: session.endedAt !== null });
}
