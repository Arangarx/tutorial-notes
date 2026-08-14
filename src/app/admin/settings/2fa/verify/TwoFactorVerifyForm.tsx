"use client";

/**
 * 2FA Verify Client Component — email OTP or TOTP based on enrollment method.
 */

import { useState, useTransition } from "react";
import { sendLoginEmailOtp, verifyEmailOtpCode, verifyTotpCode } from "../actions";

export function TwoFactorVerifyForm({
  callbackUrl,
  method,
}: {
  callbackUrl: string;
  method: "EMAIL_OTP" | "TOTP";
}) {
  const [codeInput, setCodeInput] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSendEmail() {
    setError("");
    setInfo("");
    startTransition(async () => {
      const result = await sendLoginEmailOtp();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMaskedEmail(result.maskedEmail);
      setEmailSent(true);
      setInfo(
        emailSent
          ? "We sent a new verification code to your email."
          : "We sent a verification code to your email."
      );
    });
  }

  function handleVerify() {
    const input = codeInput.replace(/\s/g, "");
    if (!input) return;
    setError("");
    setInfo("");
    startTransition(async () => {
      const result =
        method === "EMAIL_OTP"
          ? await verifyEmailOtpCode(input, { rememberDevice })
          : await verifyTotpCode(input, { rememberDevice });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.replace(callbackUrl || "/admin");
    });
  }

  const normalized = codeInput.replace(/\s/g, "");
  const isBackupLen = normalized.length === 8;
  const isTotpLen = normalized.length === 6;
  const canSubmit =
    method === "EMAIL_OTP" ? isTotpLen && !isPending : (isTotpLen || isBackupLen) && !isPending;

  if (method === "EMAIL_OTP") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {emailSent ? (
            <>
              Enter the 6-digit code we emailed
              {maskedEmail ? (
                <>
                  {" "}
                  to <strong>{maskedEmail}</strong>
                </>
              ) : null}
              .
            </>
          ) : (
            <>Send a verification code to your email, then enter it below.</>
          )}
        </p>
        {info && <p className="text-sm text-muted-foreground">{info}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="border rounded-md px-3 py-2 text-sm w-36 font-mono tracking-widest"
            autoComplete="one-time-code"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) handleVerify();
            }}
          />
          <button
            onClick={handleVerify}
            disabled={!canSubmit}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Verifying…" : "Verify"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSendEmail}
          disabled={isPending}
          className="text-sm underline"
        >
          {emailSent ? "Resend code" : "Send verification code"}
        </button>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(e) => setRememberDevice(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm">Remember this device for 30 days</span>
        </label>
        <p className="text-xs text-muted-foreground -mt-2">
          Skip the verification code on this browser when you sign in again.
          Don&apos;t use on shared computers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code from your authenticator app.
        If you have lost access, enter one of your 8-character backup codes.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={8}
          placeholder="000000"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 8))}
          className="border rounded-md px-3 py-2 text-sm w-36 font-mono tracking-widest"
          autoComplete="one-time-code"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) handleVerify();
          }}
        />
        <button
          onClick={handleVerify}
          disabled={!canSubmit}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Verifying…" : "Verify"}
        </button>
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={rememberDevice}
          onChange={(e) => setRememberDevice(e.target.checked)}
          className="rounded border-border"
        />
        <span className="text-sm">Remember this device for 30 days</span>
      </label>
      <p className="text-xs text-muted-foreground -mt-2">
        Skip the verification code on this browser when you sign in again.
        Don&apos;t use on shared computers.
      </p>
    </div>
  );
}
