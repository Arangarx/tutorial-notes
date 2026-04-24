/**
 * Server-side ownership checks for `WhiteboardSession` rows.
 * Mirrors `student-scope.ts` for the recorder + note flow.
 *
 * Every whiteboard server action / API route MUST call
 * `assertOwnsWhiteboardSession(sessionId)` before reading or mutating
 * the session. This is the multi-tenant guard called out in
 * `docs/learning-multi-tenant.md`: never trust the client-supplied
 * sessionId without re-checking it belongs to the logged-in tutor.
 *
 * Returns a partially-loaded session shape so callers don't need a
 * second round-trip to learn the studentId, consent state, and
 * eventsBlobUrl; full row reads still go through `db.whiteboardSession`.
 */

import { notFound } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";
import { canAccessStudentRow, requireStudentScope } from "@/lib/student-scope";

export type AuthorisedWhiteboardSession = {
  id: string;
  adminUserId: string;
  studentId: string;
  consentAcknowledged: boolean;
  eventsBlobUrl: string;
  endedAt: Date | null;
};

/**
 * Loads the whiteboard session and asserts the logged-in tutor owns
 * the underlying student. Calls `notFound()` on miss so callers don't
 * leak existence (same trust pattern as `assertOwnsStudent`).
 */
export async function assertOwnsWhiteboardSession(
  whiteboardSessionId: string
): Promise<AuthorisedWhiteboardSession> {
  const scope = await requireStudentScope();
  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: {
          id: true,
          adminUserId: true,
          studentId: true,
          consentAcknowledged: true,
          eventsBlobUrl: true,
          endedAt: true,
          student: { select: { adminUserId: true } },
        },
      }),
    { label: "assertOwnsWhiteboardSession" }
  );
  if (!session) notFound();
  if (!canAccessStudentRow(scope, session.student)) notFound();
  if (scope.kind === "admin" && session.adminUserId !== scope.adminId) notFound();
  return {
    id: session.id,
    adminUserId: session.adminUserId,
    studentId: session.studentId,
    consentAcknowledged: session.consentAcknowledged,
    eventsBlobUrl: session.eventsBlobUrl,
    endedAt: session.endedAt,
  };
}
