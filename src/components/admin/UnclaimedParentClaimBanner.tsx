"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ClaimInviteSection } from "@/app/admin/students/[id]/ClaimInviteSection";

/**
 * Top-of-page claim affordance for unclaimed minors — mirrors StudentErasurePendingBanner placement.
 * Reuses ClaimInviteSection mint (POST /api/students/[id]/claim-invites); no second mint path.
 */
export function UnclaimedParentClaimBanner({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  return (
    <Alert
      data-testid="unclaimed-parent-claim-banner"
      className="border-border border-l-[3px] border-l-accent bg-accent-soft/40"
    >
      <AlertTitle className="text-foreground">
        Parent must claim this student before sessions can start
      </AlertTitle>
      <AlertDescription className="text-muted-foreground">
        <p>
          Create a claim link and share it with {studentName}&apos;s parent. After
          they claim the account and set privacy preferences, you can start
          whiteboard sessions.
        </p>
        <div className="mt-3">
          <ClaimInviteSection
            studentId={studentId}
            studentName={studentName}
            alreadyClaimed={false}
            prominent
          />
        </div>
      </AlertDescription>
    </Alert>
  );
}
