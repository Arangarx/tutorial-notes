/**
 * Short-lived HMAC-signed cookie proving the user started OAuth from /signup.
 *
 * Auto-provisioning Google accounts is allowed only when this cookie validates.
 * Hitting /api/auth/signin/google from /login (or directly) must NOT create rows.
 *
 * Uses Web Crypto (Edge middleware + Node route handlers). SERVER-ONLY — never
 * import on the client.
 */

import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

/** 10 minutes — enough for an OAuth round-trip; short enough to limit abuse. */
export const SIGNUP_INTENT_TTL_MS = 10 * 60 * 1000;

export const SIGNUP_INTENT_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-mynk_signup_intent"
    : "mynk_signup_intent";

interface SignupIntentPayload {
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function signPayload(payloadB64: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Mint an opaque signup-intent token (cookie value). */
export async function mintSignupIntentToken(
  secret: string,
  nowMs: number = Date.now()
): Promise<string> {
  const payload: SignupIntentPayload = {
    issuedAt: nowMs,
    expiresAt: nowMs + SIGNUP_INTENT_TTL_MS,
    nonce: randomHex(16),
  };
  const encoded = b64url(JSON.stringify(payload));
  const sig = await signPayload(encoded, secret);
  return `${encoded}.${sig}`;
}

/**
 * Validate a signup-intent cookie value.
 * Returns true only when signature is valid and the token is unexpired.
 */
export async function isValidSignupIntentToken(
  token: string | undefined,
  secret: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  if (!token) return false;

  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;

  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = await signPayload(payloadB64, secret);
  if (!timingSafeEqualHex(providedSig, expectedSig)) return false;

  let payload: SignupIntentPayload;
  try {
    const decoded = Buffer.from(
      payloadB64.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    payload = JSON.parse(decoded) as SignupIntentPayload;
  } catch {
    return false;
  }

  if (
    typeof payload.issuedAt !== "number" ||
    typeof payload.expiresAt !== "number" ||
    typeof payload.nonce !== "string"
  ) {
    return false;
  }

  return nowMs <= payload.expiresAt;
}

/** Cookie options shared by middleware (response.cookies) and route handlers (cookies()). */
function signupIntentCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SIGNUP_INTENT_TTL_MS / 1000),
  };
}

/** Set signup-intent on a middleware/route response (Server Component pages cannot set cookies). */
export async function applySignupIntentCookieToResponse(
  response: NextResponse,
  secret: string
): Promise<void> {
  response.cookies.set(
    SIGNUP_INTENT_COOKIE,
    await mintSignupIntentToken(secret),
    signupIntentCookieOptions()
  );
}

/** Set the signup-intent cookie from a Server Action or Route Handler. */
export async function setSignupIntentCookie(secret: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    SIGNUP_INTENT_COOKIE,
    await mintSignupIntentToken(secret),
    signupIntentCookieOptions()
  );
}

/** Clear signup intent after successful provision (or on failed attempt cleanup). */
export async function clearSignupIntentCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SIGNUP_INTENT_COOKIE);
}
