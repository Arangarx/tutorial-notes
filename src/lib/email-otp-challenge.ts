/**
 * Email OTP challenges for admin/tutor 2FA — enroll + login verify.
 *
 * Pattern mirrors password-reset tokens: SHA-256 hash at rest, single-use,
 * TTL, invalidate prior unused challenges on new send.
 *
 * Log prefix: tfa (never log OTP plaintext or codeHash).
 * SERVER-ONLY.
 */

import { createHash, randomInt } from "node:crypto";
import type { AdminUser2FAEmailChallengePurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { checkAndIncrementAuthThrottle } from "@/lib/auth-rate-limit";

export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const EMAIL_OTP_SEND_MAX = 3;
export const EMAIL_OTP_SEND_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function hashEmailOtpCode(code: string): string {
  const normalized = code.replace(/\s/g, "");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function generateEmailOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function isValidEmailOtpFormat(code: string): boolean {
  return /^\d{6}$/.test(code.replace(/\s/g, ""));
}

/** Send-rate limit: 3 requests / 15 min per adminUserId. */
export async function checkEmailOtpSendRateLimit(adminUserId: string): Promise<{
  allowed: boolean;
  retryAfterMs: number;
}> {
  const scopeKey = `2fa-email-send:${adminUserId}`;
  const result = await checkAndIncrementAuthThrottle(
    "2fa-email-send",
    scopeKey,
    EMAIL_OTP_SEND_MAX,
    EMAIL_OTP_SEND_WINDOW_MS
  );
  if (!result.allowed) {
    console.log(
      `[tfa] adminUserId=${adminUserId} action=email-otp-send-rate-limited retryAfterSec=${Math.ceil(result.retryAfterMs / 1000)}`
    );
  }
  return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
}

export async function invalidateUnusedEmailOtpChallenges(
  adminUserId: string,
  purpose: AdminUser2FAEmailChallengePurpose
): Promise<void> {
  await db.adminUser2FAEmailChallenge.updateMany({
    where: { adminUserId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
}

export async function createEmailOtpChallenge(params: {
  adminUserId: string;
  twoFaId?: string | null;
  purpose: AdminUser2FAEmailChallengePurpose;
  plaintextCode: string;
}): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MS);
  const row = await db.adminUser2FAEmailChallenge.create({
    data: {
      adminUserId: params.adminUserId,
      twoFaId: params.twoFaId ?? null,
      codeHash: hashEmailOtpCode(params.plaintextCode),
      purpose: params.purpose,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });
  return row;
}

export async function verifyEmailOtpChallenge(params: {
  adminUserId: string;
  code: string;
  purpose: AdminUser2FAEmailChallengePurpose;
}): Promise<{ ok: true; challengeId: string } | { ok: false; error: string }> {
  const normalized = params.code.replace(/\s/g, "");
  if (!isValidEmailOtpFormat(normalized)) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  const codeHash = hashEmailOtpCode(normalized);
  const row = await db.adminUser2FAEmailChallenge.findFirst({
    where: {
      adminUserId: params.adminUserId,
      purpose: params.purpose,
      codeHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!row) {
    console.log(
      `[tfa] adminUserId=${params.adminUserId} action=email-otp-verify-fail purpose=${params.purpose}`
    );
    return { ok: false, error: "Invalid or expired code. Request a new code and try again." };
  }

  await db.adminUser2FAEmailChallenge.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  console.log(
    `[tfa] adminUserId=${params.adminUserId} action=email-otp-verify-success purpose=${params.purpose} challengeId=${row.id}`
  );
  return { ok: true, challengeId: row.id };
}

export async function sendEmailOtpChallenge(params: {
  adminUserId: string;
  email: string;
  purpose: AdminUser2FAEmailChallengePurpose;
  twoFaId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rl = await checkEmailOtpSendRateLimit(params.adminUserId);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many code requests. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const plaintext = generateEmailOtpCode();
  await invalidateUnusedEmailOtpChallenges(params.adminUserId, params.purpose);
  await createEmailOtpChallenge({
    adminUserId: params.adminUserId,
    twoFaId: params.twoFaId,
    purpose: params.purpose,
    plaintextCode: plaintext,
  });

  const subject =
    params.purpose === "ENROLL"
      ? "Your Mynk two-factor setup code"
      : "Your Mynk sign-in verification code";
  const intro =
    params.purpose === "ENROLL"
      ? "Enter this code to finish setting up two-factor authentication on your Mynk account:"
      : "Enter this code to finish signing in to your Mynk account:";

  const result = await sendMail({
    to: params.email,
    subject,
    text: `${intro}\n\n${plaintext}\n\nThis code expires in 10 minutes and can only be used once.\n\nIf you did not request this, you can ignore this email.`,
  });

  if (!result.sent) {
    console.log(
      `[tfa] adminUserId=${params.adminUserId} action=email-otp-send-fail purpose=${params.purpose}`
    );
    return {
      ok: false,
      error: "We could not send the verification email. Check email delivery settings or try again later.",
    };
  }

  console.log(
    `[tfa] adminUserId=${params.adminUserId} action=email-otp-sent purpose=${params.purpose}`
  );
  return { ok: true };
}
