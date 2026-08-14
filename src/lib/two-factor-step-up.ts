/**
 * TOTP step-up validation for sensitive admin operations.
 *
 * Sensitive operations (password change, authenticator rotation start,
 * backup-code regen, 2FA self/other reset, impersonation start) MUST call
 * verifyTotpStepUp() before performing the mutation. A valid trusted-device
 * cookie or session twoFactorVerified flag does NOT satisfy step-up — the
 * user must supply a live TOTP or backup code in the request.
 *
 * Rate limiting: calls check2faVerifyRateLimit(adminUserId) FIRST (shared
 * per-user bucket with verifyTotpCode — brute-force on step-up counts against
 * login-verify attempts intentionally). (B3)
 *
 * Logs: tfa=<AdminUser2FA.id> adminUserId=<id> action=step-up-success|step-up-fail
 *
 * SERVER-ONLY: never import on the client.
 */

import * as OTPAuth from "otpauth";
import { db } from "@/lib/db";
import { decryptTotpSecret } from "@/lib/crypto/totp-secret";
import { redeemBackupCode } from "@/lib/two-factor-db";
import { check2faVerifyRateLimit } from "@/lib/auth-rate-limit";
import { verifyEmailOtpChallenge } from "@/lib/email-otp-challenge";

const APP_ISSUER = "Mynk";
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_ALGORITHM = "SHA1";

export type StepUpResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validates a fresh TOTP or backup code for step-up on sensitive operations.
 *
 * Does NOT mint a trusted device. Does NOT set remember-device.
 * Rate-checks FIRST (B3) before any TOTP/backup-code validation.
 */
export async function verifyTotpStepUp(
  adminUserId: string,
  codeInput: string
): Promise<StepUpResult> {
  // B3: check rate limit before any TOTP validation (shared bucket).
  const rl = await check2faVerifyRateLimit(adminUserId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const row = await db.adminUser2FA.findUnique({
    where: { adminUserId },
    select: { id: true, method: true, totpSecretEnc: true },
  });
  if (!row) {
    return { ok: false, error: "2FA not enrolled. Cannot perform step-up verification." };
  }

  const input = codeInput.replace(/\s/g, "").toUpperCase();

  if (row.method === "EMAIL_OTP") {
    const verified = await verifyEmailOtpChallenge({
      adminUserId,
      code: input,
      purpose: "LOGIN",
    });
    if (!verified.ok) {
      console.log(
        `[tfa] tfa=${row.id} adminUserId=${adminUserId} action=step-up-fail type=email-otp`
      );
      return verified;
    }
    console.log(
      `[tfa] tfa=${row.id} adminUserId=${adminUserId} action=step-up-success type=email-otp`
    );
    return { ok: true };
  }

  const isBackupCode = input.length === 8 && /^[A-Z0-9]+$/.test(input);
  const isTotpCode = /^\d{6}$/.test(input);

  if (isBackupCode) {
    const redeemedId = await redeemBackupCode(row.id, input);
    if (!redeemedId) {
      console.log(
        `[tfa] tfa=${row.id} adminUserId=${adminUserId} action=step-up-fail type=backup`
      );
      return { ok: false, error: "Invalid or already-used backup code." };
    }
    console.log(
      `[tfa] tfa=${row.id} adminUserId=${adminUserId} action=step-up-success type=backup codeId=${redeemedId}`
    );
    return { ok: true };
  }

  if (isTotpCode) {
    if (!row.totpSecretEnc) {
      return { ok: false, error: "Authenticator app is not configured for this account." };
    }
    let secret: string;
    try {
      secret = decryptTotpSecret(row.totpSecretEnc);
    } catch (e) {
      console.error("[tfa] step-up decrypt failed:", e);
      return { ok: false, error: "Encryption key error. Contact your administrator." };
    }
    const totp = new OTPAuth.TOTP({
      issuer: APP_ISSUER,
      label: adminUserId,
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: input, window: 1 });
    if (delta === null) {
      console.log(
        `[tfa] tfa=${row.id} adminUserId=${adminUserId} action=step-up-fail type=totp`
      );
      return { ok: false, error: "Invalid code. Try again or use a backup code." };
    }
    console.log(
      `[tfa] tfa=${row.id} adminUserId=${adminUserId} action=step-up-success type=totp`
    );
    return { ok: true };
  }

  return {
    ok: false,
    error: "Enter a 6-digit authenticator code or an 8-character backup code.",
  };
}
