/**
 * Neutral denial page for share-link access by a logged-in user who does not
 * own the linked student.
 *
 * Reachable only via a redirect from assertCanAccessShareLink after it has
 * confirmed: (a) the share token is valid and not revoked, and (b) the
 * authenticated session belongs to a different account.  Not reachable
 * anonymously (anonymous users are redirected to login, not here).
 *
 * This replaces the previous notFound() call for the non-owner case, which
 * produced a generic 404 that gave no actionable guidance.
 */

import { AccountAccessDenialPage, accountAccessDenialMetadata } from "@/components/account/AccountAccessDenialPage";

export const metadata = accountAccessDenialMetadata("notes");

export default function NotMyNotesPage() {
  return <AccountAccessDenialPage variant="notes" />;
}
