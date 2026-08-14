/**
 * Canonical email normalization for auth identity lookups.
 * All signup/login paths must use this helper — do not fork trim/lowercase logic.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
