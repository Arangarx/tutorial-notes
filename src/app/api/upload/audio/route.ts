import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { getAdminByEmail } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { BLOB_MAX_BYTES } from "@/lib/blob";
/**
 * Vercel Blob client-upload endpoint.
 *
 * POST: client requests a signed upload token.
 *   - We authenticate the session and verify the tutor owns the given studentId
 *     before issuing the token.
 * Note: onUploadCompleted is intentionally omitted — its callback mechanism can
 * cause client upload() to hang waiting for Vercel's infrastructure to call back.
 * All DB writes happen in transcribeAndGenerateAction instead.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Auth: must be a signed-in tutor.
        const session = await getServerSession(authOptions);
        const email = session?.user?.email?.trim().toLowerCase();
        if (!email) {
          throw new Error("Not authenticated");
        }

        const admin = await getAdminByEmail(email);
        if (!admin) {
          throw new Error("Not authenticated");
        }

        // Multi-tenant check: verify the tutor owns the student.
        const studentId =
          typeof clientPayload === "string"
            ? clientPayload
            : typeof clientPayload === "object" &&
              clientPayload !== null &&
              "studentId" in clientPayload
            ? String((clientPayload as { studentId: unknown }).studentId)
            : null;

        if (!studentId) {
          throw new Error("Missing studentId in client payload");
        }

        const student = await db.student.findUnique({
          where: { id: studentId },
          select: { adminUserId: true },
        });

        if (!student || student.adminUserId !== admin.id) {
          throw new Error("Student not found or access denied");
        }

        return {
          allowedContentTypes: [
            "audio/webm",
            "audio/mp4",
            "audio/mpeg",
            "audio/ogg",
            "audio/wav",
            "audio/x-m4a",
          ],
          maximumSizeInBytes: BLOB_MAX_BYTES,
          tokenPayload: JSON.stringify({ adminId: admin.id, studentId }),
        };
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
