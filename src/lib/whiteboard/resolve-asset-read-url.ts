"use client";

/**
 * Private Vercel Blob URLs are not fetchable from browsers (CORS + auth).
 * Rewrite to same-origin API routes that stream with BLOB_READ_WRITE_TOKEN.
 */

export function isLikelyPrivateVercelBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith(".blob.vercel-storage.com") ||
      u.hostname.endsWith(".public.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export function resolveWhiteboardAssetReadUrl(
  raw: string,
  ctx:
    | { kind: "student"; joinToken: string }
    | { kind: "tutor"; whiteboardSessionId: string }
): string {
  if (typeof window === "undefined") return raw;
  if (!isLikelyPrivateVercelBlobUrl(raw)) return raw;
  const origin = window.location.origin;
  const u = encodeURIComponent(raw);
  if (ctx.kind === "student") {
    return `${origin}/api/w/${encodeURIComponent(ctx.joinToken)}/wb-asset?u=${u}`;
  }
  return `${origin}/api/whiteboard/${encodeURIComponent(ctx.whiteboardSessionId)}/tutor-asset?u=${u}`;
}
