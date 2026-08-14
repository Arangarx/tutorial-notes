"use client";

import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { approveTutorAction, rejectTutorAction } from "./actions";

type TutorWaitlistActionsProps = {
  adminUserId: string;
  tutorEmail: string;
};

export function TutorWaitlistActions({
  adminUserId,
  tutorEmail,
}: TutorWaitlistActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveTutorAction(adminUserId);
      if (result.ok) {
        setOutcome("approved");
      } else {
        setError(result.error);
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectTutorAction(adminUserId);
      if (result.ok) {
        setOutcome("rejected");
      } else {
        setError(result.error);
      }
    });
  }

  if (outcome === "approved") {
    return (
      <span
        className="text-xs font-medium text-green-600 dark:text-green-400"
        data-testid="tutor-approval-outcome-approved"
      >
        Approved
      </span>
    );
  }

  if (outcome === "rejected") {
    return (
      <span
        className="text-xs font-medium text-muted-foreground"
        data-testid="tutor-approval-outcome-rejected"
      >
        Rejected
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={handleApprove}
          disabled={isPending}
          data-testid="tutor-approve-button"
        >
          {isPending ? "Approving…" : "Approve"}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              data-testid="tutor-reject-button"
            >
              Reject
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject tutor signup?</AlertDialogTitle>
              <AlertDialogDescription>
                {tutorEmail} will not be able to use the platform. This does not
                delete their account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  handleReject();
                }}
                disabled={isPending}
                data-testid="tutor-reject-confirm"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
