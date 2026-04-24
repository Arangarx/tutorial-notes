/**
 * Pure decision helper for the whiteboard "Resume or End?" gate.
 *
 * Background (Sarah's pilot, Apr 2026):
 *
 *   The workspace was happily reconnecting to the relay on every
 *   page load, including hours-old tabs the tutor had walked away
 *   from. A stale student tab on the other side would silently
 *   re-register as "student joined" and start ticking the billable
 *   timer again. Worse, the tutor often had no idea which session
 *   they were looking at when reopening a bookmarked URL.
 *
 *   The fix is to stop auto-reconnecting and instead show a gate:
 *   "Resume this session?" with Resume / End buttons. The relay
 *   socket only opens after Resume — a forgotten tab is one click
 *   from being safely ended.
 *
 * Decision shape:
 *
 *   - 'fresh'              → no gate; the session is brand-new,
 *                            autoConnect proceeds.
 *   - 'stale-no-join'      → tutor started a session > N min ago and
 *                            no student ever joined. Show gate.
 *   - 'stale-after-active' → session was active and has gone idle
 *                            (lastActiveAt > N min ago). Show gate.
 *
 * Tutor-solo mode (no live-sync URL configured) ALWAYS bypasses the
 * gate — there's no relay socket to gate, the tutor is just using
 * the canvas as a notepad.
 *
 * The threshold is a tunable constant. 10 min is the chosen default:
 *   - shorter than a typical bathroom break (~5 min) would false-
 *     positive on every quick refresh.
 *   - longer than ~15 min lets a forgotten morning tab silently
 *     resume in the afternoon.
 *   - 10 min sits in the middle: a tutor stepping away briefly stays
 *     auto-resumed; a tutor returning hours later sees the gate.
 */

export const RESUME_GATE_STALENESS_MS = 10 * 60 * 1000;

export type ResumeGateInputs = {
  /** Server-truth WhiteboardSession.startedAt (ms epoch). */
  startedAtMs: number;
  /** Server-truth WhiteboardSession.lastActiveAt (ms epoch) or null. */
  lastActiveAtMs: number | null;
  /** Wall-clock at decision time (Date.now() in production). */
  nowMs: number;
  /** Whether live-sync is configured. False → tutor-solo mode. */
  syncEnabled: boolean;
  /** Override the default staleness threshold (tests / future tuning). */
  stalenessMs?: number;
};

export type ResumeGateDecision =
  | { kind: "fresh"; reason: "no-sync" | "recent-activity" | "just-started" }
  | { kind: "stale-no-join"; sinceMs: number }
  | { kind: "stale-after-active"; sinceMs: number };

export function deriveResumeGateState(inputs: ResumeGateInputs): ResumeGateDecision {
  const {
    startedAtMs,
    lastActiveAtMs,
    nowMs,
    syncEnabled,
    stalenessMs = RESUME_GATE_STALENESS_MS,
  } = inputs;

  // Tutor-solo mode: no relay, no gate. The canvas is just a notepad.
  if (!syncEnabled) {
    return { kind: "fresh", reason: "no-sync" };
  }

  // If there's been activity, the recency of the LAST ping is the
  // signal — recent ping means the room was in use, even if the
  // tutor briefly closed the tab. (Heartbeats fire every ~10s while
  // both-present, so a >10min gap means nobody was here for a while.)
  if (lastActiveAtMs !== null) {
    const sinceMs = nowMs - lastActiveAtMs;
    if (sinceMs <= stalenessMs) {
      return { kind: "fresh", reason: "recent-activity" };
    }
    return { kind: "stale-after-active", sinceMs };
  }

  // No activity ever. If the session was just started (within the
  // staleness window), give the tutor the benefit of the doubt —
  // they're probably about to send the join link. Otherwise the
  // session has been sitting idle since creation; gate it.
  const sinceStartMs = nowMs - startedAtMs;
  if (sinceStartMs <= stalenessMs) {
    return { kind: "fresh", reason: "just-started" };
  }
  return { kind: "stale-no-join", sinceMs: sinceStartMs };
}

/**
 * Human-readable copy for the gate prompt. Kept here so tests can
 * pin the contract and the component stays a thin presentation layer.
 */
export function describeResumeGate(
  decision: Exclude<ResumeGateDecision, { kind: "fresh" }>
): { headline: string; body: string } {
  const minutes = Math.max(1, Math.floor(decision.sinceMs / 60000));
  if (decision.kind === "stale-no-join") {
    return {
      headline: "Resume this whiteboard session?",
      body:
        `This session was started ${minutes} minute${minutes === 1 ? "" : "s"} ago and no student has joined yet. ` +
        `If you forgot about this tab, end the session so the join link is invalidated.`,
    };
  }
  return {
    headline: "Resume this whiteboard session?",
    body:
      `No activity in this room for ${minutes} minute${minutes === 1 ? "" : "s"}. ` +
      `Resume to reconnect, or end the session — ending will invalidate the student's join link.`,
  };
}
