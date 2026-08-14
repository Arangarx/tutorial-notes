"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import zxcvbn from "zxcvbn";
import { PasswordStrengthField } from "@/components/auth/PasswordStrengthField";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storePasswordCredential } from "@/lib/credential-manager";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-strength";
import { changePassword, sendPasswordResetEmail } from "./actions";
import { sendLoginEmailOtp } from "../2fa/actions";

interface Props {
  /** The signed-in admin's email — used as a hidden username anchor for password managers. */
  email: string;
  /** When true, a 2FA step-up field is shown above the submit button. */
  has2FA?: boolean;
  twoFactorMethod?: "EMAIL_OTP" | "TOTP";
}

export default function ChangePasswordForm({ email, has2FA, twoFactorMethod }: Props) {
  const [state, formAction] = useActionState(changePassword, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordScore, setPasswordScore] = useState<number | null>(null);
  // Ref captures the latest typed value at the moment the server action resolves
  // without adding it to useEffect deps (avoids double-fire on every keystroke).
  const latestNewPasswordRef = useRef("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetPending, startReset] = useTransition();
  const [otpMsg, setOtpMsg] = useState<string | null>(null);
  const [otpPending, startOtpSend] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      // Prompt the browser to save / update the credential before clearing the form.
      void storePasswordCredential(email, latestNewPasswordRef.current);
      formRef.current?.reset();
      setNewPassword("");
      setPasswordScore(null);
      latestNewPasswordRef.current = "";
    }
  }, [state?.ok, email]);

  return (
    <div className="max-w-sm space-y-6">
      <form ref={formRef} action={formAction} className="space-y-4">
        {/* Hidden username anchor: visually hidden but NOT aria-hidden so the
            browser password manager associates the email with the new-password
            fields and offers to generate / update the saved credential.
            aria-hidden was removed (FIX 3) — screen readers skip sr-only nodes
            via DOM order; the false aria-hidden was preventing Chrome from
            recognising the form as a credential form. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          tabIndex={-1}
          className="sr-only"
        />
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <PasswordStrengthField
            id="new-password"
            name="newPassword"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            value={newPassword}
            onChange={(e) => {
              const val = e.target.value;
              setNewPassword(val);
              latestNewPasswordRef.current = val;
              setPasswordScore(val.length > 0 ? zxcvbn(val).score : null);
            }}
            strengthScore={passwordScore}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </div>

        {has2FA && (
          <div className="space-y-1.5">
            {twoFactorMethod === "EMAIL_OTP" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Request a verification code, then enter it below to confirm the password change.
                </p>
                {otpMsg ? (
                  <p className="text-xs text-success" role="status">
                    {otpMsg}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={otpPending}
                  onClick={() => {
                    setOtpMsg(null);
                    startOtpSend(async () => {
                      const r = await sendLoginEmailOtp();
                      if (r.ok) setOtpMsg(`Code sent to ${r.maskedEmail}.`);
                      else setOtpMsg(r.error ?? "Could not send code.");
                    });
                  }}
                >
                  {otpPending ? "Sending…" : "Send verification code"}
                </Button>
              </div>
            ) : null}
            <Label htmlFor="totp-code">2FA code</Label>
            <Input
              id="totp-code"
              name="totpCode"
              type="text"
              inputMode="numeric"
              maxLength={twoFactorMethod === "EMAIL_OTP" ? 6 : 8}
              placeholder="000000"
              autoComplete="one-time-code"
              className="w-36 font-mono tracking-widest"
            />
            <p className="text-xs text-muted-foreground">
              {twoFactorMethod === "EMAIL_OTP"
                ? "Enter the 6-digit code from your email."
                : "Enter your authenticator code or backup code to confirm the password change."}
            </p>
          </div>
        )}

        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.ok ? (
          <p className="text-sm text-success" role="status">
            Password updated. Use your new password next time you sign in.
          </p>
        ) : null}

        <FormSubmitButton
          label="Update password"
          pendingLabel="Saving…"
          className="h-9 min-h-9"
        />
      </form>

      <div className="border-t border-border pt-6 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Reset via email</p>
          <p className="text-sm text-muted-foreground">
            We&rsquo;ll send a link to <strong className="text-foreground font-medium">your signed-in email</strong> so
            you can set a new password without your current one. Requires email (SMTP or Gmail) to be
            configured.
          </p>
        </div>

        {resetErr ? (
          <p className="text-sm text-destructive" role="alert">
            {resetErr}
          </p>
        ) : null}
        {resetMsg ? (
          <p className="text-sm text-success" role="status">
            {resetMsg}
          </p>
        ) : null}

        <Button
          type="button"
          variant="outline"
          disabled={resetPending}
          onClick={() => {
            setResetErr(null);
            setResetMsg(null);
            startReset(async () => {
              const r = await sendPasswordResetEmail();
              if (r.ok && r.message) setResetMsg(r.message);
              else setResetErr(r.error ?? "Could not send reset email.");
            });
          }}
        >
          {resetPending ? "Sending…" : "Email me a reset link"}
        </Button>
      </div>
    </div>
  );
}
