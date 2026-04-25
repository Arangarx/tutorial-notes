import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { env } from "@/lib/env";
import { isBlobUrlForSession } from "@/lib/whiteboard/blob-asset-in-scope";

/**
 * Logged-in tutor read proxy for the same private blob URLs, when the
 * workspace hydrates a scene that references a peer-originated asset.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;
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

  const session = await assertOwnsWhiteboardSession(sessionId);
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
      "Cache-Control": "private, max-age=300",
    },
  });
}
