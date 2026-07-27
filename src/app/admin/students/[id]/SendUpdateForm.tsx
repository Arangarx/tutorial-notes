"use client";

import { useActionState } from "react";
import Link from "next/link";
import { sendUpdateEmail, type SendUpdateResult } from "./actions";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SendUpdateForm({
  studentId,
  defaultToEmail,
}: {
  studentId: string;
  defaultToEmail: string | null;
}) {
  const [state, formAction] = useActionState(sendUpdateEmail, null as SendUpdateResult | null);

  return (
    <>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="studentId" value={studentId} />
        <div className="space-y-2">
          <Label htmlFor="toEmail">To (parent/guardian email)</Label>
          <Input
            id="toEmail"
            name="toEmail"
            type="email"
            placeholder="parent@example.com"
            defaultValue={defaultToEmail ?? ""}
            required
            className="min-h-11"
            autoComplete="email"
          />
        </div>
        <div className="flex justify-end">
          <FormSubmitButton label="Send" pendingLabel="Sending…" />
        </div>
      </form>
      {state?.ok === true && state.sent ? (
        <p className="mt-4 text-sm text-success" role="status">
          Sent to {state.toEmail}. They&apos;ll receive the link in their inbox (check junk if not).
        </p>
      ) : null}
      {state?.ok === true && state.outboxOnly ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Email is not configured. Message saved to outbox — copy the share link from above or from{" "}
          <Link href="/admin/outbox" className="text-brand underline-offset-2 hover:underline">
            Outbox
          </Link>{" "}
          to send it yourself. To actually send email, add SMTP settings to your server environment.
        </p>
      ) : null}
      {state?.ok === true && state.error && !state.sent && !state.outboxOnly ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Failed to send: {state.error}. Message saved to outbox — you can copy the link and send
          manually.
        </p>
      ) : null}
      {state?.ok === false && state.error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </>
  );
}
