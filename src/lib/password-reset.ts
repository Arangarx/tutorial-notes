import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getAdminByEmail, hasAdminUsers, updateAdminPassword } from "@/lib/auth-db";
import { sendMail } from "@/lib/email";
import { getPublicBaseUrl } from "@/lib/public-url";

const TOKEN_BYTES = 32;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function generateRawResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * If DB admin exists for email, creates token and sends reset email.
 * Returns whether an email was attempted (caller still uses generic UX).
 */
export async function requestPasswordReset(email: string): Promise<{
  emailed: boolean;
}> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { emailed: false };

  const hasDb = await hasAdminUsers();
  if (!hasDb) return { emailed: false };

  const admin = await getAdminByEmail(normalized);
  if (!admin) return { emailed: false };

  await db.passwordResetToken.deleteMany({
    where: { email: normalized, usedAt: null },
  });

  const raw = generateRawResetToken();
  const tokenHash = hashResetToken(raw);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await db.passwordResetToken.create({
    data: { email: normalized, tokenHash, expiresAt },
  });

  const base = getPublicBaseUrl();
  const url = `${base}/reset-password?token=${encodeURIComponent(raw)}`;

  const result = await sendMail({
    to: normalized,
    subject: "Reset your Tutoring Notes password",
    text: `We received a request to reset the password for this account.\n\nOpen this link (valid for one hour):\n${url}\n\nIf you did not ask for this, you can ignore this email.`,
  });

  return { emailed: result.sent };
}

export async function completePasswordReset(
  rawToken: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = newPassword.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const tokenHash = hashResetToken(rawToken.trim());
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!row || row.usedAt) {
    return { ok: false, error: "This reset link is invalid or was already used." };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This reset link has expired. Request a new one." };
  }

  await updateAdminPassword(row.email, trimmed);
  await db.passwordResetToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  await db.passwordResetToken.deleteMany({
    where: { email: row.email, usedAt: null },
  });

  return { ok: true };
}
