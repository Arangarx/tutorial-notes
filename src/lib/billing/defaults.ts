/**
 * WS-J — shared billing default constants (Andrew-gated).
 */

import type { RoundingMode } from "./rounding";

/** Andrew-gated default for new tutors (Sarah: round up to 5-min buckets). */
export const DEFAULT_ROUNDING_INCREMENT_MIN = 5;
export const DEFAULT_ROUNDING_MODE: RoundingMode = "up";

/** Fixed fallback when tutor timezone is unset at close (not server TZ). */
export const DEFAULT_TUTOR_TIMEZONE = "America/Denver";

const VALID_MODES: ReadonlySet<string> = new Set(["nearest", "up", "down"]);
const VALID_INCREMENTS = new Set([1, 5, 15, 30]);

export function normalizeRoundingMode(
  value: string | null | undefined
): RoundingMode {
  if (value && VALID_MODES.has(value)) {
    return value as RoundingMode;
  }
  return DEFAULT_ROUNDING_MODE;
}

export function normalizeRoundingIncrement(
  value: number | null | undefined
): number {
  if (value != null && VALID_INCREMENTS.has(value)) {
    return value;
  }
  return DEFAULT_ROUNDING_INCREMENT_MIN;
}

function isValidIanaTimezone(zone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function resolveTutorTimezone(
  sessionTz: string | null | undefined,
  adminTz: string | null | undefined
): string {
  const sessionCandidate = sessionTz?.trim();
  if (sessionCandidate && isValidIanaTimezone(sessionCandidate)) {
    return sessionCandidate;
  }
  const adminCandidate = adminTz?.trim();
  if (adminCandidate && isValidIanaTimezone(adminCandidate)) {
    return adminCandidate;
  }
  return DEFAULT_TUTOR_TIMEZONE;
}
