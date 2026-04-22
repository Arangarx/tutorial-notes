/**
 * Pure timing policy for the audio recorder.
 *
 * Owns the segment / warning / safety thresholds and the (pure) decision
 * functions the timer asks every second. Lives outside the React tree so it
 * can be unit tested without jsdom and tuned without re-reading the recorder.
 *
 * Tuning rationale:
 *  - SEGMENT_MAX_SECONDS: keeps each browser blob small enough to upload over
 *    iffy mobile data; server-side ffmpeg already splits anything bigger for
 *    Whisper so the limit here is purely a UX / memory choice.
 *  - WARN_SEGMENT_SECONDS: gives the tutor time to wrap a thought before the
 *    auto-rollover chime fires.
 *  - SESSION_SAFETY_MAX_SECONDS: pathological-runaway guard. Counts only timer
 *    ticks (pauses while paused), so a tutor on a real 8h marathon with
 *    breaks won't trip it; a tab left running overnight will.
 */

export const SEGMENT_MAX_SECONDS = 50 * 60; // 50 minutes per segment
export const WARN_SEGMENT_SECONDS = SEGMENT_MAX_SECONDS - 5 * 60; // warn 5 min before rollover
export const SESSION_SAFETY_MAX_SECONDS = 8 * 60 * 60; // hard stop for runaway sessions

/**
 * Test-only override hook.
 *
 * Playwright (and other browser-driven smokes) need the rollover to fire on
 * the order of seconds, not 50 minutes. Setting these on `window` before the
 * recorder mounts shrinks the segment cap to e.g. 6 seconds with a 3-second
 * warn window:
 *
 *   await page.addInitScript(() => {
 *     (window as any).__SEGMENT_MAX_SECONDS_OVERRIDE = 6;
 *     (window as any).__WARN_SEGMENT_SECONDS_OVERRIDE = 3;
 *   });
 *
 * Production code paths are unchanged: the override is gated to non-production
 * builds, so a stray window-property pollution in prod can't shorten a tutor's
 * recording session. See tests/e2e/audio-rollover.spec.ts for the smoke that
 * exercises this hook.
 */
type SegmentOverrideWindow = {
  __SEGMENT_MAX_SECONDS_OVERRIDE?: number;
  __WARN_SEGMENT_SECONDS_OVERRIDE?: number;
};

function readOverride(key: keyof SegmentOverrideWindow): number | null {
  if (typeof window === "undefined") return null;
  if (process.env.NODE_ENV === "production") return null;
  const v = (window as unknown as SegmentOverrideWindow)[key];
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return null;
}

/** Effective segment cap, accounting for the dev/test window override. */
export function effectiveSegmentMaxSeconds(): number {
  return readOverride("__SEGMENT_MAX_SECONDS_OVERRIDE") ?? SEGMENT_MAX_SECONDS;
}

/** Effective warn threshold, accounting for the dev/test window override. */
export function effectiveWarnSegmentSeconds(): number {
  return readOverride("__WARN_SEGMENT_SECONDS_OVERRIDE") ?? WARN_SEGMENT_SECONDS;
}

/**
 * True when the current segment's elapsed time has reached the rollover
 * threshold. Caller is responsible for the "already in progress" guard so
 * we don't double-fire from rapid timer ticks.
 */
export function shouldRolloverSegment(elapsedSeconds: number): boolean {
  return elapsedSeconds >= effectiveSegmentMaxSeconds();
}

/**
 * True when the current segment has crossed the "approaching max" warning
 * threshold and we haven't already fired the chime for this segment.
 *
 * The `alreadyFired` flag exists so pause/resume (which restarts the timer
 * without resetting elapsed) doesn't replay the chime mid-segment.
 */
export function shouldFireApproachingChime(
  elapsedSeconds: number,
  alreadyFired: boolean
): boolean {
  return elapsedSeconds >= effectiveWarnSegmentSeconds() && !alreadyFired;
}

/**
 * True when the cross-segment session timer has hit the runaway-safety cap.
 * Only timer-active seconds count (paused time excluded), so a tutor with
 * normal breaks won't trip this at hour 8.
 */
export function shouldHardStopSession(totalElapsedSeconds: number): boolean {
  return totalElapsedSeconds >= SESSION_SAFETY_MAX_SECONDS;
}

/**
 * Human-friendly time-remaining label for the in-segment warning.
 * Switches from minutes to seconds at 90s so the prod copy reads
 * "~5 min left" but smoke / short-segment tests read "~30s left".
 */
export function formatSegmentTimeLeft(secondsLeft: number): string {
  const safe = Math.max(0, secondsLeft);
  return safe >= 90 ? `~${Math.ceil(safe / 60)} min left` : `~${safe}s left`;
}
