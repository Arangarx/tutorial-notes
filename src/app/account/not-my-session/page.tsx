/**
 * Neutral denial page for /join/[sessionId] access by a logged-in user who is
 * not the session's learner (wrong account-holder or wrong learner principal).
 *
 * Reachable only via redirect from the join page after it has confirmed the
 * session exists and the authenticated principal cannot join. Anonymous users
 * are sent to JoinAuthGate instead; child-session cross-learner denies stay 404.
 */

import { AccountAccessDenialPage, accountAccessDenialMetadata } from "@/components/account/AccountAccessDenialPage";

export const metadata = accountAccessDenialMetadata("session");

export default function NotMySessionPage() {
  return <AccountAccessDenialPage variant="session" />;
}
