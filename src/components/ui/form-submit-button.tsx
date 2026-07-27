"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonVariant = ComponentProps<typeof Button>["variant"];

export interface FormSubmitButtonProps {
  label: string;
  pendingLabel?: string;
  className?: string;
  variant?: ButtonVariant;
  /**
   * Caller-imposed disabled state, ORed with the in-flight `pending`
   * state. Used by forms that require an interactive precondition
   * (e.g. a consent checkbox) before submission is allowed.
   */
  disabled?: boolean;
  /** Passed to the native `<button>` (a11y). */
  "aria-label"?: string;
}

function variantFromLegacyClass(className?: string): ButtonVariant {
  if (className?.includes("destructive")) return "destructive";
  if (className?.includes("primary") || className === "btn primary") return "default";
  if (className?.includes("btn") && !className.includes("primary")) return "outline";
  return "default";
}

export function FormSubmitButton({
  label,
  pendingLabel,
  className,
  variant: variantProp,
  disabled,
  "aria-label": ariaLabel,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  const variant = variantProp ?? variantFromLegacyClass(className);

  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending || !!disabled}
      aria-label={ariaLabel}
      aria-busy={pending}
      className={cn("min-h-11", className?.includes("btn") ? undefined : className)}
    >
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </Button>
  );
}
