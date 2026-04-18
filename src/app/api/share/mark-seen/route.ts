import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/share/mark-seen
 * Body: { token: string; noteId: string }
 *
 * Called client-side (fire-and-forget) by SeenTracker when a note card
 * becomes visible in the viewport. Validates the share link before writing.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const noteId = typeof body?.noteId === "string" ? body.noteId.trim() : "";

    if (!token || !noteId) {
      return NextResponse.json({ error: "token and noteId required" }, { status: 400 });
    }

    // Validate the share link is active.
    const link = await db.shareLink.findUnique({
      where: { token },
      select: { revokedAt: true, studentId: true },
    });
    if (!link || link.revokedAt) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }

    // Validate the note belongs to this share link's student.
    const note = await db.sessionNote.findFirst({
      where: { id: noteId, studentId: link.studentId },
      select: { id: true },
    });
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Upsert — idempotent, so duplicate fires from the observer are harmless.
    await db.noteView.upsert({
      where: { shareToken_noteId: { shareToken: token, noteId } },
      create: { shareToken: token, noteId },
      update: { seenAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
