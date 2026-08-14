/**
 * Authorization helpers for the authenticated /join/[sessionId] path.
 *
 * The /join path accepts two principals:
 *   1. Learner session (mynk_learner_session)  — all learner types.
 *   2. Account-holder session (mynk_ah_session) — ONLY when LearnerProfile.isSelfLearner===true
 *      and the AccountHolder owns that profile. [WB-JOIN-ADULT-LEARNER]
 *
 * For page route handlers use assertIsSessionParticipant (from session-participant-scope.ts)
 * + the inline ownership check in the page itself (which has the session data already).
 *
 * For API route handlers use `resolveAhJoinLearnerProfileId` which does the DB lookup
 * + ownership + isSelfLearner check and returns the learnerProfileId on success (or null
 * on any denial). Callers then run verifyIsSessionParticipant with the returned id.
 *
 * Log prefixes:
 *   wjg= (whiteboard join gate)
 *   lpr= (learner profile)
 *
 * SERVER-ONLY: never import on the client.
 */

import { redirect } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";

/** Neutral denial page for authenticated wrong principal on /join/[sessionId]. */
export const NOT_MY_SESSION_PATH = "/account/not-my-session" as const;

/** Redirect helper — use only when an authenticated AH is the wrong principal. */
export function redirectJoinWrongPrincipal(): never {
  redirect(NOT_MY_SESSION_PATH);
}

/**
 * Resolve the learnerProfileId for an account-holder join attempt.
 *
 * For use in **API route handlers** (which cannot use notFound() / redirect()).
 *
 * Returns `{ learnerProfileId }` when:
 *   - The WhiteboardSession has an associated Student with a linked LearnerProfile
 *   - LearnerProfile.isSelfLearner === true
 *   - LearnerProfile.accountHolderId === accountHolderId (caller owns the profile)
 *   - LearnerProfile.tombstonedAt === null (not COPPA-deleted)
 *
 * Returns null on any denial (missing profile, not self-learner, wrong owner, tombstoned).
 * Emits wjg= and lpr= log lines on both grant and denial.
 *
 * Does NOT check SessionParticipant — callers must run verifyIsSessionParticipant
 * after receiving a non-null result.
 */
export async function resolveAhJoinLearnerProfileId(
  sessionId: string,
  accountHolderId: string
): Promise<{ learnerProfileId: string } | null> {
  const shortId = sessionId.slice(0, 8);

  const sessionRow = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: {
          student: {
            select: {
              learnerProfileId: true,
              learnerProfile: {
                select: {
                  id: true,
                  isSelfLearner: true,
                  accountHolderId: true,
                  tombstonedAt: true,
                },
              },
            },
          },
        },
      }),
    { label: "resolveAhJoinLearnerProfileId.session" }
  );

  const learnerProfileId = sessionRow?.student?.learnerProfileId ?? null;
  const lp = sessionRow?.student?.learnerProfile ?? null;

  if (!learnerProfileId || !lp) {
    console.error(
      `[wjg] wjg=${shortId} wbsid=${sessionId} action=ah_join_denied reason=no_profile accountHolderId=${accountHolderId}`
    );
    return null;
  }

  if (!lp.isSelfLearner) {
    console.error(
      `[wjg] wjg=${shortId} wbsid=${sessionId} action=ah_join_denied reason=not_self_learner accountHolderId=${accountHolderId} lpr=${learnerProfileId}`
    );
    return null;
  }

  if (lp.tombstonedAt !== null || lp.accountHolderId !== accountHolderId) {
    console.error(
      `[lpr] lpr=${learnerProfileId} action=assert_owns_denied accountHolderId=${accountHolderId}`
    );
    console.error(
      `[wjg] wjg=${shortId} wbsid=${sessionId} action=ah_join_denied reason=not_owner accountHolderId=${accountHolderId} lpr=${learnerProfileId}`
    );
    return null;
  }

  console.info(
    `[wjg] wjg=${shortId} wbsid=${sessionId} action=ah_ownership_granted accountHolderId=${accountHolderId} lpr=${learnerProfileId}`
  );
  return { learnerProfileId };
}
