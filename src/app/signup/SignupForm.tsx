"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import zxcvbn from "zxcvbn";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { GoogleSignInSection } from "@/components/auth/GoogleSignInSection";
import { PasswordStrengthField } from "@/components/auth/PasswordStrengthField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-strength";
import { signup } from "./actions";

export default function SignupForm({
  googleOAuthAvailable,
}: {
  googleOAuthAvailable: boolean;
}) {
  const [state, formAction] = useActionState(signup, null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordScore, setPasswordScore] = useState<number | null>(null);
  const formErrorId = useId();

  // Reset the submitting state whenever the server action returns an error so
  // the button re-enables and the user can correct their input and retry.
  useEffect(() => {
    if (state?.error) {
      setBusy(false);
    }
  }, [state?.error]);

  return (
    <>
      {googleOAuthAvailable ? (
        <div className="mb-4">
          <GoogleSignInSection
            callbackUrl="/admin/pending-approval"
            noticeVariant="sign-up"
          />
          <p className="my-4 text-center text-sm text-muted-foreground">or</p>
        </div>
      ) : null}

      <form action={formAction} className="flex flex-col gap-4" onSubmit={() => setBusy(true)}>
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="min-h-11"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? formErrorId : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <PasswordStrengthField
          id="signup-password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(e) => {
            const val = e.target.value;
            setPassword(val);
            setPasswordScore(val.length > 0 ? zxcvbn(val).score : null);
          }}
          strengthScore={passwordScore}
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? formErrorId : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password-confirm">Confirm password</Label>
        <Input
          id="signup-password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          className="min-h-11"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? formErrorId : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-displayName">Your name (shown to parents in emails)</Label>
        <Input
          id="signup-displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder="e.g. Alex Chen"
          className="min-h-11"
        />
        <p className="text-sm text-muted-foreground">
          Optional but recommended. You can change this later under Admin → Profile.
        </p>
      </div>

      {state?.error ? <AuthFieldError id={formErrorId} message={state.error} /> : null}

      <div className="flex flex-col gap-3 pt-1">
        <Button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Creating…" : "Create account"}
        </Button>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-brand underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
    </>
  );
}
