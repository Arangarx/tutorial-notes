"use client";

/**
 * 2FA Setup Client Component — email OTP default + TOTP opt-in.
 */

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  startTotpEnrollment,
  confirmTotpEnrollment,
  clearPostEnrollCookie,
  startEmailOtpEnrollment,
  confirmEmailOtpEnrollment,
  resendEmailOtpEnrollment,
} from "../actions";

type SetupMethod = "email" | "totp";

type Step =
  | "idle"
  | "loading-start"
  | "email-sent"
  | "email-confirming"
  | "show-qr"
  | "confirming"
  | "show-backup"
  | "error";

export function TwoFactorSetupForm({
  pendingEmailEnrollment,
  pendingMaskedEmail,
}: {
  pendingEmailEnrollment?: boolean;
  pendingMaskedEmail?: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<SetupMethod>("email");
  const [step, setStep] = useState<Step>(
    pendingEmailEnrollment ? "email-sent" : "idle"
  );
  const [maskedEmail, setMaskedEmail] = useState(pendingMaskedEmail ?? "");
  const [qrDataUri, setQrDataUri] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [tokenInput, setTokenInput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [backupCodes]);

  const handleDownload = useCallback(() => {
    const header = "Mynk 2FA Backup Codes — store these in a safe place.\n\n";
    const blob = new Blob([header + backupCodes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mynk-2fa-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [backupCodes]);

  function handleStartEmail() {
    setMethod("email");
    setStep("loading-start");
    setError("");
    startTransition(async () => {
      const result = await startEmailOtpEnrollment();
      if (!result.ok) {
        setError(result.error);
        setStep("error");
        return;
      }
      setMaskedEmail(result.maskedEmail);
      setStep("email-sent");
    });
  }

  function handleResendEmail() {
    setError("");
    startTransition(async () => {
      const result = await resendEmailOtpEnrollment();
      if (!result.ok) setError(result.error);
    });
  }

  function handleConfirmEmail() {
    if (!tokenInput.trim()) return;
    setError("");
    setStep("email-confirming");
    startTransition(async () => {
      const result = await confirmEmailOtpEnrollment(tokenInput.trim());
      if (!result.ok) {
        setError(result.error);
        setStep("email-sent");
        return;
      }
      router.push("/admin/students");
    });
  }

  function handleStartTotp() {
    setMethod("totp");
    setStep("loading-start");
    setError("");
    startTransition(async () => {
      const result = await startTotpEnrollment();
      if (!result.ok) {
        setError(result.error);
        setStep("error");
        return;
      }
      setQrDataUri(result.qrDataUri);
      setSecret(result.secret);
      setStep("show-qr");
    });
  }

  function handleConfirmTotp() {
    if (!tokenInput.trim()) return;
    setError("");
    setStep("confirming");
    startTransition(async () => {
      const result = await confirmTotpEnrollment(tokenInput.trim());
      if (!result.ok) {
        setError(result.error);
        setStep("show-qr");
        return;
      }
      setBackupCodes(result.backupCodes);
      setStep("show-backup");
    });
  }

  function switchToTotp() {
    setTokenInput("");
    setError("");
    handleStartTotp();
  }

  function switchToEmail() {
    setTokenInput("");
    setError("");
    setStep("idle");
    setMethod("email");
  }

  if (step === "idle" || step === "loading-start") {
    const loading = isPending || step === "loading-start";
    if (method === "totp" && loading) {
      return (
        <p className="text-sm text-muted-foreground">Preparing authenticator setup…</p>
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Two-factor authentication adds a second layer of security. By default we email a
          one-time code to your account address — no app required.
        </p>
        <button
          onClick={handleStartEmail}
          disabled={loading}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {loading && method === "email" ? "Sending code…" : "Set up 2FA"}
        </button>
        <button
          type="button"
          onClick={switchToTotp}
          disabled={loading}
          className="block text-sm underline text-muted-foreground hover:text-foreground"
        >
          Use authenticator app instead
        </button>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={() => {
            setStep("idle");
            setMethod("email");
          }}
          className="text-sm underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (step === "email-sent" || step === "email-confirming") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to <strong>{maskedEmail}</strong>. Enter it below to finish setup.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmEmail();
          }}
          className="flex flex-wrap gap-2 items-center"
        >
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="border rounded-md px-3 py-2 text-sm w-32 font-mono tracking-widest"
            autoComplete="one-time-code"
            autoFocus
          />
          <button
            type="submit"
            disabled={isPending || tokenInput.length < 6}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Verifying…" : "Confirm"}
          </button>
        </form>
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" onClick={handleResendEmail} disabled={isPending} className="underline">
            Resend code
          </button>
          <button type="button" onClick={switchToTotp} disabled={isPending} className="underline text-muted-foreground">
            Use authenticator app instead
          </button>
        </div>
      </div>
    );
  }

  if (step === "show-qr" || step === "confirming") {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={switchToEmail}
          disabled={isPending}
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          Use email code instead
        </button>
        <div>
          <h2 className="text-base font-semibold mb-2">Step 1 — Scan this QR code</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Open your authenticator app and scan the code below, or enter the secret manually.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUri}
            alt="TOTP QR code"
            width={200}
            height={200}
            className="border rounded-md"
          />
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
              Can&apos;t scan? Enter the key manually
            </summary>
            <code className="block mt-2 text-xs bg-muted px-3 py-2 rounded break-all select-all">
              {secret}
            </code>
          </details>
        </div>

        <div>
          <h2 className="text-base font-semibold mb-2">Step 2 — Enter the 6-digit code to confirm</h2>
          <p className="text-sm text-muted-foreground mb-2">
            Enter the code from your authenticator app to complete setup.
          </p>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmTotp();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="border rounded-md px-3 py-2 text-sm w-32 font-mono tracking-widest"
              autoComplete="one-time-code"
              autoFocus
            />
            <button
              type="submit"
              disabled={isPending || tokenInput.length < 6}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Verifying…" : "Confirm"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === "show-backup") {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-4">
          <h2 className="text-base font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
            Save your backup codes — shown once only
          </h2>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
            Store these in a safe place. Each code can only be used once to recover access
            if you lose your authenticator.
          </p>
          <div className="grid grid-cols-2 gap-1">
            {backupCodes.map((c) => (
              <code key={c} className="text-xs bg-white dark:bg-black/30 border rounded px-2 py-1 font-mono select-all">
                {c}
              </code>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
            >
              {copied ? "Copied!" : "Copy codes"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
            >
              Download .txt
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          ✓ 2FA is now active. You will be asked to verify on each new login.
        </p>
        <button
          type="button"
          onClick={async () => {
            await clearPostEnrollCookie();
            router.push("/admin");
          }}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Continue to dashboard
        </button>
      </div>
    );
  }

  return null;
}
