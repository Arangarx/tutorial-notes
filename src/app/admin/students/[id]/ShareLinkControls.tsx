"use client";

import { FormSubmitButton } from "@/components/ui/form-submit-button";

export function RegenerateShareLinkForm({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <FormSubmitButton
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
      <FormSubmitButton label="Revoke" pendingLabel="Revoking…" variant="outline" />
    </form>
  );
}

export function CreateShareLinkForm({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <FormSubmitButton label="Create share link" variant="default" />
    </form>
  );
}
