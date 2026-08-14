/**
 * Shared neutral denial shell for authenticated users on the wrong account.
 * Used by /account/not-my-notes (share links) and /account/not-my-session (join).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";

export type AccountAccessDenialVariant = "notes" | "session";

const COPY: Record<
  AccountAccessDenialVariant,
  { title: string; description: string; body: string }
> = {
  notes: {
    title: "Notes not linked to your account",
    description: "This notes link isn't associated with your account.",
    body:
      "If you think this is a mistake, ask the tutor to resend the link to your registered email address, or check that you're signed in with the correct account.",
  },
  session: {
    title: "Session not linked to your account",
    description: "This session link isn't associated with your account.",
    body:
      "If you think this is a mistake, ask the tutor to resend the link to your registered email address, or check that you're signed in with the correct account.",
  },
};

export function accountAccessDenialMetadata(
  variant: AccountAccessDenialVariant
): Metadata {
  const { title } = COPY[variant];
  return {
    title,
    robots: { index: false, follow: false },
  };
}

export function AccountAccessDenialPage({
  variant,
}: {
  variant: AccountAccessDenialVariant;
}) {
  const { title, description, body } = COPY[variant];

  return (
    <AuthShell title={title} description={description}>
      <p className="mb-6 text-sm text-muted-foreground">{body}</p>

      <Button asChild variant="accent" className="min-h-11 w-full text-base">
        <Link href="/account/dashboard">Go to your dashboard</Link>
      </Button>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link
          href="/account/login"
          className="text-brand underline-offset-2 hover:underline"
        >
          Sign in with a different account
        </Link>
      </p>
    </AuthShell>
  );
}
