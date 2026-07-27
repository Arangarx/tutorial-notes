/**
 * WS-J — pure billable-minute rounding (no I/O).
 *
 * Converts raw billable milliseconds into whole minutes, then rounds to the
 * tutor's increment using nearest / up / down.
 */

export type RoundingMode = "nearest" | "up" | "down";

const MS_PER_MINUTE = 60_000;

/**
 * Round raw billable milliseconds to whole minutes at the given increment.
 *
 * @param rawMs — unparsed billable duration in milliseconds (≥ 0)
 * @param incrementMin — rounding bucket size in minutes (1 = no rounding beyond ceil-to-minute)
 * @param mode — nearest | up | down
 */
export function roundBillableMinutes(
  rawMs: number,
  incrementMin: number,
  mode: RoundingMode
): number {
  const safeMs = Math.max(0, rawMs);
  const safeIncrement = Math.max(1, Math.floor(incrementMin));

  // Sub-minute fractions count as a full minute for billing (Sarah bills in minutes).
  const rawMinutes = Math.ceil(safeMs / MS_PER_MINUTE);

  if (safeIncrement <= 1) {
    return rawMinutes;
  }

  const quotient = rawMinutes / safeIncrement;

  switch (mode) {
    case "up":
      return Math.ceil(quotient) * safeIncrement;
    case "down":
      return Math.floor(quotient) * safeIncrement;
    case "nearest":
    default: {
      const rounded = Math.round(quotient) * safeIncrement;
      // Non-zero session time must not round to 0 under nearest/up (1 min → nearest 5).
      if (rawMinutes > 0 && rounded === 0 && mode === "nearest") {
        return safeIncrement;
      }
      return rounded;
    }
  }
}
