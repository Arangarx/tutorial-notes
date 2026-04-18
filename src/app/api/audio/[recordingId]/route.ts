import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Proxy private Vercel Blob audio to browsers on the share page.
 * Private blobs require a Bearer token — browsers can't fetch them directly.
 *
 * GET /api/audio/[recordingId]?token=<shareToken>
 *
 * Validates:
 *   1. The share link exists and is not revoked.
 *   2. The recording belongs to a note on that share link's student.
 *   3. shareRecordingInEmail is true on the note.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ recordingId: string }> }
): Promise<Response> {
  const { recordingId } = await params;
  const url = new URL(_req.url);
  const shareToken = url.searchParams.get("token");

  if (!shareToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  // Verify the share link is valid and not revoked.
  const link = await db.shareLink.findUnique({
    where: { token: shareToken },
    select: { revokedAt: true, studentId: true },
  });
  if (!link || link.revokedAt) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }

  // Verify the recording exists, belongs to this student, and its note has sharing enabled.
  const recording = await db.sessionRecording.findFirst({
    where: {
      id: recordingId,
      studentId: link.studentId,
      note: { shareRecordingInEmail: true },
    },
    select: { blobUrl: true, mimeType: true },
  });

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const { blobUrl, mimeType } = recording;
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";

  // Fetch from Vercel Blob with auth and stream to the client.
  const blobRes = await fetch(blobUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!blobRes.ok) {
    return NextResponse.json({ error: "Audio unavailable" }, { status: 502 });
  }

  return new Response(blobRes.body, {
    status: 200,
    headers: {
      "Content-Type": mimeType || "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
