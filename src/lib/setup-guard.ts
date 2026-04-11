import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

function setupSecret(): string | undefined {
  const s = env.SETUP_SECRET?.trim();
  return s || undefined;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Production must never expose an open /setup form (first visitor wins). */
export function setupBlockedNoSecretInProduction(): boolean {
  return isProduction() && !setupSecret();
}

/**
 * True when /setup form is allowed without ?token= (local dev only, no SETUP_SECRET).
 * Vercel/production always requires SETUP_SECRET + matching token for the form.
 */
export function setupReachableWithoutToken(): boolean {
  if (setupBlockedNoSecretInProduction()) return false;
  if (!isProduction() && !setupSecret()) return true;
  return false;
}

/** Validates ?token / form field against SETUP_SECRET when a secret is configured. */
export function setupTokenValid(provided: string | null | undefined): boolean {
  const secret = setupSecret();
  const token = (provided ?? "").trim();
  if (!secret) {
    if (isProduction()) return false;
    return true;
  }
  return timingSafeEqualStrings(token, secret);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  try {
    const x = Buffer.from(a, "utf8");
    const y = Buffer.from(b, "utf8");
    if (x.length !== y.length) return false;
    return timingSafeEqual(x, y);
  } catch {
    return false;
  }
}
