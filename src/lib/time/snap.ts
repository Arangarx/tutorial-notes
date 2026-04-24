/**
 * Time-input helpers for `<input type="time">` controls that ship
 * `step={300}` (5-minute grid).
 *
 * Why this lives in lib/: both NewNoteForm (create) and notes/page.tsx
 * (edit defaults) need to snap incoming Date values to the same grid
 * so HTML5 `step` validation doesn't reject AI-prefilled or historical
 * times on submit. Sharing one implementation prevents drift.
 *
 * Sarah's request (Apr 2026 demo feedback): "5-minute increments. Just
 * less numbers to filter through which is nice." Wyzant uses the same
 * grid. The snap is purely a display / form-validity convenience —
 * the underlying recording timestamps stay precise on disk.
 */

const FIVE_MIN_SEC = 300;

/** Step (in seconds) for `<input type="time" step={...}>` — 5 minutes. */
export const TIME_INPUT_STEP_SECONDS = FIVE_MIN_SEC;

/**
 * Snap an `HH:MM` total-minute count to the nearest 5-minute boundary.
 * Wraps past midnight (23:58 -> 00:00). Tutoring sessions don't span
 * midnight in practice; the wrap is correctness-only.
 */
function snapMinutesToFive(totalMin: number): number {
  const snapped = Math.round(totalMin / 5) * 5;
  return ((snapped % (24 * 60)) + 24 * 60) % (24 * 60);
}

/** Format a snapped minute count as zero-padded `HH:MM`. */
function formatHHMM(wrappedMin: number): string {
  const hh = Math.floor(wrappedMin / 60).toString().padStart(2, "0");
  const mm = (wrappedMin % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Format a Date in the BROWSER's local timezone as `HH:MM`, snapped
 * to the nearest 5-minute boundary. Returns `""` for null / invalid.
 *
 * Use when rendering to a `<input type="time">` whose value will be
 * read back as wall-clock local time (e.g. NewNoteForm's AI-prefill).
 */
export function formatLocalTimeSnapped(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  return formatHHMM(snapMinutesToFive(d.getHours() * 60 + d.getMinutes()));
}

/**
 * Format a Date as UTC `HH:MM`, snapped to the nearest 5-minute
 * boundary. Returns `""` for null.
 *
 * Use when the stored time was UTC at write time and the read-back
 * value will be re-interpreted as UTC (notes/page.tsx edit defaults
 * — see formatTimeInput's caller for the historical context).
 */
export function formatUtcTimeSnapped(d: Date | null): string {
  if (!d) return "";
  return formatHHMM(snapMinutesToFive(d.getUTCHours() * 60 + d.getUTCMinutes()));
}
