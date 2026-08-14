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
import { revokeTutorApprovalAction } from "./actions";

type RevokeTutorAccessButtonProps = {
  adminUserId: string;
  tutorEmail: string;
};

export function RevokeTutorAccessButton({
  adminUserId,
  tutorEmail,
}: RevokeTutorAccessButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeTutorApprovalAction(adminUserId);
      if (result.ok) {
        setRevoked(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (revoked) {
    return (
      <span
        className="text-xs font-medium text-muted-foreground"
        data-testid="tutor-revoke-outcome"
      >
        Access revoked
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            data-testid="tutor-revoke-button"
          >
            Revoke access
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke tutor access?</AlertDialogTitle>
            <AlertDialogDescription>
              {tutorEmail} will return to the waitlist and cannot use the
              platform until re-approved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleRevoke();
              }}
              disabled={isPending}
              data-testid="tutor-revoke-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
