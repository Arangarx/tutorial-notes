"use client";

import { FormSubmitButton } from "@/components/ui/form-submit-button";

export function ImpersonateSubmitForm({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <FormSubmitButton label="Log in as" pendingLabel="Opening…" />
    </form>
  );
}
