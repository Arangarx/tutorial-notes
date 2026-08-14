"use client";

import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type SessionStartBlockedCalloutProps = {
  studentId: string;
  studentClaimed: boolean;
  claimInvitesEnabled: boolean;
  hasTopClaimBanner: boolean;
};

/**
 * Prominent blocked state when Start whiteboard session is unavailable (consent/claim gate).
 */
export function SessionStartBlockedCallout({
  studentId,
  studentClaimed,
  claimInvitesEnabled,
  hasTopClaimBanner,
}: SessionStartBlockedCalloutProps) {
  const parentSectionHref = `/admin/students/${studentId}#student-section-parent`;

  return (
    <Alert
      data-testid="start-wb-consent-callout"
      className="min-w-0 break-words border-border border-l-[3px] border-l-warning bg-warning/5"
      role="alert"
    >
      <AlertTitle className="text-foreground">
        Start whiteboard session unavailable
      </AlertTitle>
      <AlertDescription className="text-muted-foreground">
        {studentClaimed ? (
          <>
            <p>
              A parent account is connected, but privacy preferences are not
              complete. You cannot start a session until the parent finishes
              them.
            </p>
            <p className="mt-2">
              Ask the parent to sign in to their Mynk account and complete
              privacy preferences for this learner. They can find this under
              their child&apos;s profile in Account.
            </p>
          </>
        ) : (
          <>
            <p>
              Before you can start a session, the student&apos;s parent must claim
              this account and set privacy preferences.
            </p>
            <p className="mt-2">
              {hasTopClaimBanner ? (
                <>
                  Use the <strong className="font-semibold text-foreground">claim link</strong>{" "}
                  banner above to create and copy an invite, or open the{" "}
                  <Link
                    href={parentSectionHref}
                    className="font-medium text-accent-text underline underline-offset-2"
                  >
                    Parent account
                  </Link>{" "}
                  section for details.
                </>
              ) : claimInvitesEnabled ? (
                <>
                  Open the{" "}
                  <Link
                    href={parentSectionHref}
                    className="font-medium text-accent-text underline underline-offset-2"
                  >
                    Parent account
                  </Link>{" "}
                  section to create a claim invite or check connection status.
                </>
              ) : (
                <>
                  Parent account linking is not enabled on this site yet. Open
                  the{" "}
                  <Link
                    href={parentSectionHref}
                    className="font-medium text-accent-text underline underline-offset-2"
                  >
                    Parent account
                  </Link>{" "}
                  section for more information.
                </>
              )}
            </p>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
