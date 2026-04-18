import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStudentScope } from "@/lib/student-scope";

/**
 * Proxy private Vercel Blob audio for authenticated admin/tutor users.
 * Unlike /api/audio/[recordingId] (share-token), this requires an active session.
 *
 * GET /api/audio/admin/[recordingId]
 *
 * Validates:
 *   1. The request has a valid admin session.
 *   2. The recording belongs to that admin (adminUserId matches).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ recordingId: string }> }
): Promise<Response> {
  const { recordingId } = await params;

  const scope = await getStudentScope();
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DB admin: scope by their adminUserId.
  // Env-only admin (legacy): scope by student ownership (students with adminUserId: null).
  const recording = await db.sessionRecording.findFirst({
    where:
      scope.kind === "admin"
        ? { id: recordingId, adminUserId: scope.adminId }
        : { id: recordingId, student: { adminUserId: null } },
    select: { blobUrl: true, mimeType: true },
  });

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const { blobUrl, mimeType } = recording;
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";

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
