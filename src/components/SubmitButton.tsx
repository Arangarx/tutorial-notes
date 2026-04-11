"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  label: string;
  pendingLabel?: string;
  className?: string;
}

export function SubmitButton({
  label,
  pendingLabel,
  className = "btn primary",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  );
}
