/**
 * Validate that a Vercel Blob URL belongs to a specific whiteboard session.
 * Prevents a joiner from proxying other sessions' files via a stolen token.
 */

import { isAllowedBlobUrl, pathnameFromHarnessUrl } from "@/lib/blob-harness";

export type ParsedInScope = {
  studentId: string;
  whiteboardSessionId: string;
};

const PATH_RE =
  /\/whiteboard-sessions\/([^/]+)\/([^/]+)\//;

/**
 * Extract studentId + sessionId from our upload pathnames
 * `whiteboard-sessions/{studentId}/{sessionId}/...`.
 */
export function parseWhiteboardSessionIdsFromPublicUrl(
  publicUrl: string
): ParsedInScope | null {
  try {
    const harnessPath = pathnameFromHarnessUrl(publicUrl);
    const pathForMatch = harnessPath
      ? `/${harnessPath.replace(/^\/+/, "")}`
      : new URL(publicUrl).pathname;
    const m = PATH_RE.exec(pathForMatch);
    if (!m) return null;
    return { studentId: m[1], whiteboardSessionId: m[2] };
  } catch {
    return null;
  }
}

export function isBlobUrlForSession(
  publicUrl: string,
  expect: { studentId: string; whiteboardSessionId: string }
): boolean {
  if (!isAllowedBlobUrl(publicUrl)) return false;
  const parsed = parseWhiteboardSessionIdsFromPublicUrl(publicUrl);
  if (!parsed) return false;
  return (
    parsed.studentId === expect.studentId &&
    parsed.whiteboardSessionId === expect.whiteboardSessionId
  );
}
