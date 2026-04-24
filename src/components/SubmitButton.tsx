"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  label: string;
  pendingLabel?: string;
  className?: string;
  /**
   * Caller-imposed disabled state, ORed with the in-flight `pending`
   * state. Used by forms that require an interactive precondition
   * (e.g. a consent checkbox) before submission is allowed.
   */
  disabled?: boolean;
}

export function SubmitButton({
  label,
  pendingLabel,
  className = "btn primary",
  disabled,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      type="submit"
      disabled={pending || !!disabled}
    >
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  );
}
