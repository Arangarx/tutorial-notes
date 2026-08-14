/**
 * /join/[sessionId] — authenticated learner live-session entry point.
 *
 * AUTH BOUNDARY (BLOCKERs):
 *   - Two valid principals:
 *     1. Learner session (mynk_learner_session) — standard child + account-holder-session learners.
 *     2. Account-holder session (mynk_ah_session) — ONLY when LearnerProfile.isSelfLearner===true
 *        and the AccountHolder owns that profile. [WB-JOIN-ADULT-LEARNER]
 *   - Participant gate: learnerProfileId must have an active SessionParticipant row for
 *     this session. Learner A cannot reach learner B's session → 404.
 *   - A CHILD (non-self) learner's session is NEVER joinable via an AH session.
 *   - Fragment preservation: a server redirect cannot carry #k=, so the
 *     unauthenticated path renders a client component (JoinAuthGate) that
 *     saves the fragment then redirects to the correct login for the learner type.
 *
 * The E2E whiteboard encryption key stays CLIENT-ONLY in the URL fragment
 * #k=<key>. The server NEVER sees it.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createHash } from "crypto";
import { db, withDbRetry } from "@/lib/db";
import { env } from "@/lib/env";
import {
  getLearnerSessionFromHeaders,
  getAccountHolderSessionFromHeaders,
} from "@/lib/server-session";
import { redirectJoinWrongPrincipal } from "@/lib/join-scope";
import {
  assertIsSessionParticipant,
  verifyIsSessionParticipant,
} from "@/lib/session-participant-scope";
import { WhiteboardSessionShell } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell";
import { JoinAuthGate } from "./JoinAuthGate";
import { JoinHashRestorer } from "./JoinHashRestorer";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Whiteboard session",
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}

type RouteParams = { sessionId: string };

export default async function JoinSessionPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { sessionId } = await params;

  // -------------------------------------------------------------------------
  // Early session lookup — needed before auth to:
  //   1. Determine isSelfLearner for JoinAuthGate redirect direction.
  //   2. Verify AH principal ownership inline (avoids a second DB round-trip).
  //
  // Also supplies all rendering data so no second query is needed post-auth.
  // -------------------------------------------------------------------------
  const session = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      studentId: true,
      endedAt: true,
      sessionPhase: true,
      activeMs: true,
      lastActiveAt: true,
      adminUser: {
        select: { displayName: true, email: true },
      },
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
  });

  if (!session) notFound();

  const lpId = session.student?.learnerProfileId ?? null;
  const lp = session.student?.learnerProfile ?? null;
  const isSelfLearner = lp?.isSelfLearner ?? false;

  // -------------------------------------------------------------------------
  // AUTH: resolve effective learnerProfileId from either valid principal.
  // -------------------------------------------------------------------------
  let effectiveLearnerProfileId: string | null = null;

  // Path A: standard learner session (mynk_learner_session).
  // Accepts child_pin_required AND account_holder_session learners.
  //
  // Non-fatal participant check: if the learner cookie exists but the profile is NOT
  // a participant of this session (e.g. stale cookie from a prior PIN-login attempt
  // on the wrong child), fall through to Path B rather than 404-ing immediately.
  // The old `assertIsSessionParticipant` (throwing) would 404 before Path B ran,
  // blocking a legitimate AH session that owns the self-learner profile.
  // [WB-ADULT-JOIN-ENABLEMENT — stale-cookie fallback]
  const learnerSession = await getLearnerSessionFromHeaders();
  let learnerCookieNotParticipant = false;
  if (learnerSession) {
    const isParticipant = await verifyIsSessionParticipant(
      learnerSession.learnerProfileId,
      sessionId
    );
    if (isParticipant) {
      console.info(
        `[lpr] lpr=${learnerSession.learnerProfileId} action=session_join_granted sessionId=${sessionId}`
      );
      effectiveLearnerProfileId = learnerSession.learnerProfileId;
    } else {
      // Non-participant learner cookie — fall through to Path B.
      learnerCookieNotParticipant = true;
      console.info(
        `[wjg] wjg=${sessionId.slice(0, 8)} wbsid=${sessionId}` +
          ` action=learner_cookie_fallthrough reason=not_participant` +
          ` lpr=${learnerSession.learnerProfileId}`
      );
    }
  }

  // Path B: account-holder session (mynk_ah_session) — self-learner ONLY.
  // [WB-JOIN-ADULT-LEARNER] A CHILD (isSelfLearner=false) session is NEVER
  // joinable via an AH session, even if the AH is the child's parent.
  if (!effectiveLearnerProfileId) {
    const ahSession = await getAccountHolderSessionFromHeaders();
    if (ahSession) {
      const shortId = sessionId.slice(0, 8);

      if (!lpId || !lp || !isSelfLearner) {
        // No self-learner profile — deny AH access (child session or unclaimed student).
        console.error(
          `[wjg] wjg=${shortId} wbsid=${sessionId} action=ah_join_denied` +
            ` reason=${!lpId ? "no_profile" : "not_self_learner"}` +
            ` accountHolderId=${ahSession.accountHolderId}`
        );
        redirectJoinWrongPrincipal();
      }

      if (
        lp.tombstonedAt !== null ||
        lp.accountHolderId !== ahSession.accountHolderId
      ) {
        // Ownership failure — authenticated wrong account-holder.
        console.error(
          `[lpr] lpr=${lpId} action=assert_owns_denied accountHolderId=${ahSession.accountHolderId}`
        );
        console.error(
          `[wjg] wjg=${shortId} wbsid=${sessionId} action=ah_join_denied` +
            ` reason=not_owner accountHolderId=${ahSession.accountHolderId} lpr=${lpId}`
        );
        redirectJoinWrongPrincipal();
      }

      // Ownership confirmed — participant gate (same check as learner path).
      // assertIsSessionParticipant calls notFound() when no active participant row.
      await assertIsSessionParticipant(lpId, sessionId);

      console.info(
        `[wjg] wjg=${shortId} wbsid=${sessionId} action=ah_join_granted` +
          ` accountHolderId=${ahSession.accountHolderId} lpr=${lpId}`
      );
      effectiveLearnerProfileId = lpId;
    }
  }

  // -------------------------------------------------------------------------
  // No valid session: fail closed (role-aware).
  //
  // CHILD session + non-participant learner cookie (Path B also failed):
  //   → 404 (fail closed; wrong-learner cross-session deny; do not reveal
  //     the session exists to a non-participant).
  //
  // SELF-LEARNER session + stale non-participant learner cookie + no AH session:
  //   → fall through to JoinAuthGate so isSelfLearner redirects to /account/login.
  //   The stale cookie came from a prior wrong PIN-login attempt; the adult
  //   just hasn't got their AH cookie yet. Sending them to account login is correct.
  //   [WB-ADULT-JOIN-ENABLEMENT — stale-cookie self-learner fallthrough]
  //
  // No cookie at all → render JoinAuthGate so they can log in.
  // -------------------------------------------------------------------------
  if (!effectiveLearnerProfileId) {
    if (learnerCookieNotParticipant && !isSelfLearner) {
      // Child session: non-participant cookie is a genuine cross-learner deny.
      console.error(
        `[wjg] wjg=${sessionId.slice(0, 8)} wbsid=${sessionId}` +
          ` action=join_denied_both_paths reason=not_participant`
      );
      notFound();
    }
    if (learnerCookieNotParticipant && isSelfLearner) {
      // Self-learner session: stale learner cookie, no AH session present.
      // Fall through to JoinAuthGate → redirects to /account/login.
      console.info(
        `[wjg] wjg=${sessionId.slice(0, 8)} wbsid=${sessionId}` +
          ` action=self_learner_fallthrough_to_authgate reason=stale_cookie_not_participant`
      );
    }
    return <JoinAuthGate sessionId={sessionId} isSelfLearner={isSelfLearner} />;
  }

  // -------------------------------------------------------------------------
  // B2: allowLiveSession consent check — deny entry if the snapshot says false.
  //
  // Applies to child learners only (self-learners auto-pass). Unclaimed
  // sessions (no learnerProfileId) keep existing behavior — no snapshot
  // denial. Claimed minors without a snapshot (grandfathered pre-CC-1) are
  // denied fail-closed (H-5).
  // -------------------------------------------------------------------------
  if (!isSelfLearner) {
    const consentSnap = await withDbRetry(
      () =>
        db.sessionConsentSnapshot.findUnique({
          where: { whiteboardSessionId: sessionId },
          select: { allowLiveSession: true },
        }),
      { label: "joinSessionPage.consentSnapshot" }
    );
    const noSnapshotForClaimedMinor = lpId !== null && consentSnap === null;
    const liveSessionDenied =
      consentSnap !== null && consentSnap.allowLiveSession === false;
    if (noSnapshotForClaimedMinor || liveSessionDenied) {
      if (noSnapshotForClaimedMinor) {
        console.info(
          `[wjg] wjg=${sessionId.slice(0, 8)} wbsid=${sessionId}` +
            ` action=join_denied reason=no_consent_snapshot` +
            ` lpr=${effectiveLearnerProfileId}`
        );
      } else {
        console.info(
          `[wjg] wjg=${sessionId.slice(0, 8)} wbsid=${sessionId}` +
            ` action=join_denied_consent_live_session` +
            ` lpr=${effectiveLearnerProfileId}`
        );
      }
      return (
        <main className="container" style={{ maxWidth: 720, padding: "2rem" }}>
          <div className="card">
            <h1 style={{ marginTop: 0 }}>Session not available</h1>
            <p>
              Your account does not have permission to join live whiteboard
              sessions. Please ask your parent or guardian to update your
              session preferences, then have your tutor start a new session.
            </p>
          </div>
        </main>
      );
    }
  }

  // -------------------------------------------------------------------------
  // Post-auth rendering.
  // -------------------------------------------------------------------------

  // identity-peerid workstream: compute a session-scoped identity key.
  // sha256(learnerProfileId:sessionId)[:12hex] — opaque, not reversible
  // to the raw learnerProfileId. Stable for the same learner within a
  // session (enables dual-device detection) but NOT correlatable across
  // sessions (different sessionId → different salt → different hash).
  const identityKey = createHash("sha256")
    .update(`${effectiveLearnerProfileId}:${sessionId}`)
    .digest("hex")
    .slice(0, 12);

  const tutorName =
    session.adminUser?.displayName?.trim() ||
    session.adminUser?.email?.split("@")[0] ||
    "your tutor";

  if (session.endedAt) {
    return (
      <main className="container" style={{ maxWidth: 720, padding: "2rem" }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Session ended</h1>
          <p>
            This whiteboard session has ended. Your tutor may have shared notes
            or a replay link with you.
          </p>
        </div>
      </main>
    );
  }

  if (!env.WHITEBOARD_SYNC_URL) {
    return (
      <main className="container" style={{ maxWidth: 720, padding: "2rem" }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Whiteboard not available</h1>
          <p>
            Live whiteboard collaboration is not enabled in this environment.
            Please ask {tutorName} to share a recording link instead.
          </p>
        </div>
      </main>
    );
  }

  // JoinHashRestorer runs before the student shell so the #k= fragment is
  // in place when the shell's key-read effect fires.
  return (
    <JoinHashRestorer sessionId={sessionId}>
      <WhiteboardSessionShell
        role="student"
        whiteboardSessionId={session.id}
        studentId={session.studentId}
        syncUrl={env.WHITEBOARD_SYNC_URL}
        tutorName={tutorName}
        initialActiveMs={session.activeMs ?? 0}
        initialLastActiveAtIso={session.lastActiveAt?.toISOString() ?? null}
        initialSessionPhase={
          (session.sessionPhase as "PENDING" | "ACTIVE" | undefined) ?? "ACTIVE"
        }
        identityKey={identityKey}
        learnerProfileId={effectiveLearnerProfileId}
      />
    </JoinHashRestorer>
  );
}
