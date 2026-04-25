import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { env } from "@/lib/env";
import { isBlobUrlForSession } from "@/lib/whiteboard/blob-asset-in-scope";

/**
 * Same-origin read proxy for Vercel Blob **private** whiteboard-asset URLs.
 * Student browsers cannot fetch `*.blob.vercel-storage.com` for private
 * objects; `hydrate-remote-files` rewrites fetches to this route. Auth is
 * the join token; `u` must live under the token's `whiteboard-sessions/.../`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ joinToken: string }> }
): Promise<Response> {
  const { joinToken } = await ctx.params;
  if (!env.BLOB_READ_WRITE_TOKEN) {
    return new NextResponse("Blob storage is not configured.", { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const u = searchParams.get("u");
  if (!u) {
    return new NextResponse("Missing u query parameter.", { status: 400 });
  }
  let publicUrl: string;
  try {
    publicUrl = decodeURIComponent(u);
    // eslint-disable-next-line no-new -- validate URL
    new URL(publicUrl);
  } catch {
    return new NextResponse("Invalid u parameter.", { status: 400 });
  }

  const tokenRow = await withDbRetry(
    () =>
      db.whiteboardJoinToken.findUnique({
        where: { token: joinToken },
        select: {
          whiteboardSessionId: true,
          expiresAt: true,
          revokedAt: true,
          whiteboardSession: { select: { id: true, studentId: true, endedAt: true } },
        },
      }),
    { label: "whiteboard-join-asset" }
  );

  if (!tokenRow || !tokenRow.whiteboardSession) {
    return new NextResponse("Not found.", { status: 404 });
  }
  const now = new Date();
  if (tokenRow.revokedAt || tokenRow.expiresAt.getTime() <= now.getTime()) {
    return new NextResponse("Not found.", { status: 404 });
  }
  if (tokenRow.whiteboardSession.endedAt) {
    return new NextResponse("Session ended.", { status: 410 });
  }

  const session = tokenRow.whiteboardSession;
  if (
    !isBlobUrlForSession(publicUrl, {
      studentId: session.studentId,
      whiteboardSessionId: session.id,
    })
  ) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const result = await get(publicUrl, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const ct = result.blob.contentType ?? "application/octet-stream";
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
