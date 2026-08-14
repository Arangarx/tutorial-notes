/**
 * POST /api/auth/account-holder/signup
 *
 * Anti-enumeration: ALWAYS returns HTTP 200 regardless of whether the email exists.
 * If the email exists: sends a "looks like you already have an account" email.
 * If new: creates AccountHolder + sends verification email.
 *
 * P2a: email send is stubbed (logs link to console). Real send wired in P2b.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findEmailRealmPresence } from "@/lib/cross-realm-email";
import { normalizeEmail } from "@/lib/normalize-email";
import { hashAccountHolderPassword } from "@/lib/account-holder-auth";
import { hashToken, EMAIL_TOKEN_TTL_MS_24H } from "@/lib/crypto/session-tokens";
import { generateRawToken } from "@/lib/crypto/session-tokens";
import { stubSendAccountHolderEmail } from "@/lib/account-holder-email";
import { getPublicBaseUrl, getRequestBaseUrlSafe } from "@/lib/public-url";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "@/lib/password-strength";

const OK_RESPONSE = {
  message: "If that email is registered, you'll receive an email. Check your inbox.",
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { email, password, displayName, isSelfLearner, returnTo } = body as {
    email?: string;
    password?: string;
    displayName?: string;
    isSelfLearner?: boolean;
    returnTo?: string;
  };

  const normalizedEmail = normalizeEmail(email ?? "");

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }
  const strengthCheck = validatePasswordStrength(password);
  if (!strengthCheck.ok) {
    return NextResponse.json({ error: "password_too_weak" }, { status: 400 });
  }

  const presence = await findEmailRealmPresence(normalizedEmail);

  if (presence.inAccountHolder || presence.inAdmin) {
    // Anti-enumeration: don't reveal the account exists to anonymous callers.
    // Send a "you already have an account" email to the real owner.
    const base = getPublicBaseUrl();
    await stubSendAccountHolderEmail({
      to: normalizedEmail,
      subject: "Your Mynk account already exists",
      text: `It looks like you already have a Mynk account. Try logging in instead: ${base}/account/login\n\nIf you forgot your password, you can reset it at: ${base}/account/forgot-password`,
      actionUrl: `${base}/account/login`,
    });
    return NextResponse.json(OK_RESPONSE);
  }

  // New account
  const passwordHash = await hashAccountHolderPassword(password);
  const selfLearner = isSelfLearner === true;
  const accountHolder = await db.accountHolder.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      displayName: displayName?.trim() || null,
      isSelfLearner: selfLearner,
    },
  });

  // IAC-8: if signing up as self-learner, create the self-LearnerProfile immediately
  if (selfLearner) {
    const selfName = displayName?.trim() || normalizedEmail.split("@")[0] || "Me";
    await db.learnerProfile.create({
      data: {
        accountHolderId: accountHolder.id,
        displayName: selfName,
        isSelfLearner: true,
        accessMode: "account_holder_session",
      },
    });
    console.log(`[ahx] ahx=${accountHolder.id} action=self_learner_profile_created`);
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS_24H);

  await db.accountHolderEmailToken.create({
    data: {
      accountHolderId: accountHolder.id,
      tokenHash,
      purpose: "SIGNUP_VERIFY",
      expiresAt,
    },
  });

  const base = getRequestBaseUrlSafe(req);
  // Sanitize returnTo: must be a relative path starting with /
  const safeReturn =
    returnTo && /^\/[a-zA-Z0-9\-/_?=&%]+$/.test(returnTo) ? returnTo : null;
  const verifyUrl = `${base}/verify-email?token=${encodeURIComponent(rawToken)}&type=ah${safeReturn ? `&returnTo=${encodeURIComponent(safeReturn)}` : ""}`;

  await stubSendAccountHolderEmail({
    to: normalizedEmail,
    subject: "Confirm your Mynk account",
    text: `Welcome to Mynk! Please confirm your email address by clicking the link below (valid for 24 hours):\n\n${verifyUrl}`,
    actionUrl: verifyUrl,
  });

  console.log(`[ahx] ahx=${accountHolder.id} action=signup email=${normalizedEmail}`);

  return NextResponse.json(OK_RESPONSE);
}
