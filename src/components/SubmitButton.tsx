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
  /** Passed to the native `<button>` (a11y). */
  "aria-label"?: string;
}

export function SubmitButton({
  label,
  pendingLabel,
  className = "btn primary",
  disabled,
  "aria-label": ariaLabel,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      type="submit"
      disabled={pending || !!disabled}
      aria-label={ariaLabel}
    >
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  );
}
