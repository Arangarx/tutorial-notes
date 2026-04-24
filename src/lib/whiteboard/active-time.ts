/**
 * Pure helpers for the Wyzant-style "both connected" time accumulator.
 *
 * Lives outside the API route so unit tests can pin the gap-accounting
 * rules without spinning up a database — see
 * `src/__tests__/whiteboard/active-time.test.ts`.
 *
 * Vocabulary used below:
 *   - "active" means BOTH parties are connected to the live room
 *     right now. The tutor's workspace decides this from its own
 *     socket state + sync-client peer count and POSTs heartbeats to
 *     /api/whiteboard/[id]/active-ping with `active: true|false`.
 *   - `activeMs` is the running total of milliseconds the parties
 *     have been together so far, persisted on `WhiteboardSession`.
 *   - `lastActiveAt` is the server-stamped wall-clock of the most
 *     recent positive heartbeat. Null = currently paused (no segment
 *     in progress), Date = a segment is in progress.
 *
 * Why a staleness threshold:
 *
 *   The tutor's heartbeat cadence is ~10s while a segment is active.
 *   If the workspace tab closes / loses network without a `false`
 *   ping landing, lastActiveAt would still be set when the next
 *   `true` ping arrives. Treating that whole gap as billable time
 *   (could be hours) re-introduces the exact bug we're fixing —
 *   billing through the student's absence. So gaps over the threshold
 *   are NOT credited; we just stamp lastActiveAt and start a fresh
 *   segment that begins counting from now.
 */

/**
 * Maximum acceptable wall-clock gap between two `active=true` pings
 * before we treat them as separate segments.
 *
 * 60s = 6x the client's nominal 10s heartbeat. That's slack for a
 * tab-throttled background, a slow Vercel cold start, or a brief
 * network blip — but small enough that a closed tab isn't billed
 * past about a minute. Tunable; widen with care.
 */
export const ACTIVE_PING_STALE_MS = 60_000;

export type ActivePingInput = {
  /** Current wall-clock in ms since epoch (so tests can pin time). */
  nowMs: number;
  /** True if the workspace believes both parties are connected NOW. */
  active: boolean;
  /** Existing accumulated billable ms from the database. */
  prevActiveMs: number;
  /** Existing lastActiveAt from the database (ms since epoch), or null. */
  prevLastActiveAtMs: number | null;
  /** Existing bothConnectedAt from the database (ms since epoch), or null. */
  prevBothConnectedAtMs: number | null;
  /** Override the staleness window — defaults to ACTIVE_PING_STALE_MS. */
  staleThresholdMs?: number;
};

export type ActivePingResult = {
  /** New `WhiteboardSession.activeMs` value to persist. */
  activeMs: number;
  /**
   * New `WhiteboardSession.lastActiveAt` value (ms since epoch), or
   * null when the segment just ended.
   */
  lastActiveAtMs: number | null;
  /**
   * New `WhiteboardSession.bothConnectedAt` value (ms since epoch), or
   * null. Only filled in if THIS ping should stamp the legacy
   * "first overlap" anchor for the first time. Caller decides whether
   * to actually write it (skip if the column was already non-null).
   */
  bothConnectedAtMs: number | null;
  /**
   * How many ms the caller credited to `activeMs` on this ping. 0
   * for the first ping in a fresh segment, 0 for a stale gap, 0 for
   * `active=false` when there was no segment in progress.
   */
  creditedMs: number;
};

/**
 * Compute the next `WhiteboardSession` row state given the previous
 * row + the current ping. Pure: no IO, no clock reads, no randomness
 * — `nowMs` is an explicit parameter so tests can step time.
 */
export function computeActivePingUpdate(
  input: ActivePingInput
): ActivePingResult {
  const {
    nowMs,
    active,
    prevActiveMs,
    prevLastActiveAtMs,
    prevBothConnectedAtMs,
    staleThresholdMs = ACTIVE_PING_STALE_MS,
  } = input;

  // Clamp negative deltas (clock skew, replayed ping) to 0 so we never
  // SUBTRACT from activeMs. That would let a misbehaving client roll
  // back the billable timer.
  const safeGapMs =
    prevLastActiveAtMs === null ? 0 : Math.max(0, nowMs - prevLastActiveAtMs);
  const gapWithinThreshold = safeGapMs <= staleThresholdMs;

  if (active) {
    // Crediting rule: only add the gap when there WAS a segment in
    // progress AND that segment isn't stale.
    const credited =
      prevLastActiveAtMs !== null && gapWithinThreshold ? safeGapMs : 0;
    const nextActiveMs = prevActiveMs + credited;
    return {
      activeMs: nextActiveMs,
      lastActiveAtMs: nowMs,
      bothConnectedAtMs:
        prevBothConnectedAtMs === null ? nowMs : prevBothConnectedAtMs,
      creditedMs: credited,
    };
  }

  // active === false — close out any in-progress segment.
  const credited =
    prevLastActiveAtMs !== null && gapWithinThreshold ? safeGapMs : 0;
  const nextActiveMs = prevActiveMs + credited;
  return {
    activeMs: nextActiveMs,
    lastActiveAtMs: null,
    // Don't stamp bothConnectedAt on a `false` ping — it represents
    // "students together"; a disconnect heartbeat shouldn't synthesize
    // an "anchor" value if the legacy field was never set.
    bothConnectedAtMs: prevBothConnectedAtMs,
    creditedMs: credited,
  };
}

/**
 * Helper for the workspace UI: given the server-truth state and the
 * client-observed presence, compute what the live timer should DISPLAY
 * right now. Lets the on-screen pill keep ticking between ping
 * round-trips (the server only knows up to the last heartbeat).
 *
 * Display rule:
 *   - If we are currently active locally AND the server has a
 *     lastActiveAt that's still fresh, display
 *     `activeMs + (now - lastActiveAt)`.
 *   - If we are currently active locally but the server hasn't
 *     stamped a fresh lastActiveAt yet (initial mount, in-flight
 *     ping), display the persisted activeMs only — better to
 *     under-count by < 10s than risk double-counting on resume.
 *   - If we are NOT currently active, display the persisted activeMs
 *     verbatim. The "0:00 (waiting for student)" copy is the
 *     caller's job, not ours.
 */
export function computeDisplayActiveMs(input: {
  nowMs: number;
  serverActiveMs: number;
  serverLastActiveAtMs: number | null;
  clientActiveNow: boolean;
  staleThresholdMs?: number;
}): number {
  const {
    nowMs,
    serverActiveMs,
    serverLastActiveAtMs,
    clientActiveNow,
    staleThresholdMs = ACTIVE_PING_STALE_MS,
  } = input;
  if (!clientActiveNow) return Math.max(0, serverActiveMs);
  if (serverLastActiveAtMs === null) return Math.max(0, serverActiveMs);
  const gap = nowMs - serverLastActiveAtMs;
  if (gap < 0) return Math.max(0, serverActiveMs);
  if (gap > staleThresholdMs) return Math.max(0, serverActiveMs);
  return Math.max(0, serverActiveMs + gap);
}
