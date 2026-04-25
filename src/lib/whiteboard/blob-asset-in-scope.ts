/**
 * Validate that a Vercel Blob URL belongs to a specific whiteboard session.
 * Prevents a joiner from proxying other sessions' files via a stolen token.
 */

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
    const u = new URL(publicUrl);
    const m = PATH_RE.exec(u.pathname);
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
  const parsed = parseWhiteboardSessionIdsFromPublicUrl(publicUrl);
  if (!parsed) return false;
  return (
    parsed.studentId === expect.studentId &&
    parsed.whiteboardSessionId === expect.whiteboardSessionId
  );
}
