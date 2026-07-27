"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

function LogInAsButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="default"
      disabled={pending}
      aria-busy={pending}
      className="min-h-11"
    >
      {pending ? "Opening…" : "Log in as"}
    </Button>
  );
}

export function ImpersonateSubmitForm({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <LogInAsButton />
    </form>
  );
}
