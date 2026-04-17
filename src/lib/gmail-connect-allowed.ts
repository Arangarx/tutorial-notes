import { env } from "@/lib/env";

/**
 * When `GMAIL_CONNECT_ALLOWLIST` is unset or empty, any signed-in admin may start Gmail OAuth (legacy behavior).
 * When set to a comma-separated list of emails, only those accounts may connect Gmail — blocks random signups from using OAuth.
 */
export function isGmailConnectAllowedForEmail(email: string | null | undefined): boolean {
  const raw = env.GMAIL_CONNECT_ALLOWLIST?.trim();
  if (!raw) return true;
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  const e = (email ?? "").trim().toLowerCase();
  return list.includes(e);
}
