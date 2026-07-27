"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type ButtonVariant = ComponentProps<typeof Button>["variant"];

function ShareLinkSubmitButton({
  label,
  pendingLabel,
  variant = "default",
}: {
  label: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      aria-busy={pending}
      className="min-h-11"
    >
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </Button>
  );
}

export function RegenerateShareLinkForm({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <ShareLinkSubmitButton
        label="Regenerate"
        pendingLabel="Regenerating…"
        variant="outline"
      />
    </form>
  );
}

export function RevokeShareLinkForm({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <ShareLinkSubmitButton label="Revoke" pendingLabel="Revoking…" variant="outline" />
    </form>
  );
}

export function CreateShareLinkForm({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <ShareLinkSubmitButton label="Create share link" variant="default" />
    </form>
  );
}
