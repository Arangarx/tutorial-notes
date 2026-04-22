/**
 * Calendar-day primitives for `SessionNote.date`.
 *
 * The DB column is Postgres `DATE` (`@db.Date` in schema.prisma), which has
 * no time component and no timezone. Prisma still hands the value back to
 * JS as a `Date` object pinned at **UTC midnight**, so any display code
 * MUST format using UTC accessors — `toLocaleDateString()` without a
 * `timeZone: "UTC"` opt-in will roll the day backward for any viewer west
 * of UTC. That was Sarah's bug: typed Apr 22, displayed Apr 21.
 *
 * Use these helpers at the IO boundaries:
 *   - `parseDateOnlyInput`: form `<input type="date">` (YYYY-MM-DD) → Date
 *   - `formatDateOnlyDisplay`: stored Date → user-facing string
 *   - `formatDateOnlyInput`: stored Date → YYYY-MM-DD for `defaultValue`
 */

/**
 * Parse the YYYY-MM-DD value posted by `<input type="date">` into a Date
 * suitable for storage in our `@db.Date` column. The time component is
 * discarded by Postgres — we use UTC midnight as a stable canonical form.
 *
 * Returns null on malformed input.
 */
export function parseDateOnlyInput(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Back-compat alias — older imports used the noon-hack name. */
export const parseDateOnlyToUtcNoon = parseDateOnlyInput;

/**
 * Format a stored calendar-day Date as a short user-facing string.
 * Uses the UTC accessors so the displayed day matches the tutor's typed day
 * in every viewer timezone.
 *
 * Default locale matches what `Date.prototype.toLocaleDateString()` produces
 * with no args (the viewer's locale), but with `timeZone: "UTC"` pinned.
 */
export function formatDateOnlyDisplay(d: Date | string, locale?: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(date);
}

/**
 * Format a stored calendar-day Date as YYYY-MM-DD for `<input type="date">`
 * `defaultValue` round-tripping. Uses UTC accessors for the same reason.
 */
export function formatDateOnlyInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
