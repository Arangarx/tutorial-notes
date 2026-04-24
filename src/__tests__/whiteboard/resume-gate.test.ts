/**
 * Pure-function tests for the whiteboard "Resume or End?" gate
 * decision helper.
 *
 * Sarah's pilot ask (Apr 2026, transcript): "hold up... does the link
 * never change? suddenly it says a student joined" → root cause was
 * an old workspace tab silently auto-reconnecting and pulling in a
 * stale student tab. The fix is to gate the relay socket behind an
 * explicit "Resume?" prompt for stale sessions.
 *
 * The decision rules these tests pin:
 *
 *   - Tutor-solo mode (no syncEnabled) NEVER gates. The canvas works
 *     as a notepad and there's no relay to gate.
 *   - Recent activity (<= staleness threshold since lastActiveAt) →
 *     no gate. A bathroom break / refresh shouldn't interrupt.
 *   - Long since last activity → 'stale-after-active'. Gate.
 *   - Just-started session (<= threshold since startedAt, no activity)
 *     → no gate. Tutor is probably about to send the link.
 *   - Old session, no activity ever → 'stale-no-join'. Gate.
 *
 * A regression in any of these silently re-introduces the original
 * "hours-old tab auto-bills new time" bug.
 */

import {
  deriveResumeGateState,
  describeResumeGate,
  RESUME_GATE_STALENESS_MS,
} from "@/lib/whiteboard/resume-gate";

const NOW = 1_750_000_000_000; // arbitrary fixed wall-clock for determinism

describe("deriveResumeGateState", () => {
  describe("tutor-solo mode (syncEnabled=false)", () => {
    it("never gates, regardless of how stale", () => {
      const r = deriveResumeGateState({
        startedAtMs: NOW - 24 * 60 * 60 * 1000, // 24h ago
        lastActiveAtMs: NOW - 12 * 60 * 60 * 1000,
        nowMs: NOW,
        syncEnabled: false,
      });
      expect(r).toEqual({ kind: "fresh", reason: "no-sync" });
    });
  });

  describe("recent-activity bypass (last ping within threshold)", () => {
    it("0s since last ping → fresh", () => {
      const r = deriveResumeGateState({
        startedAtMs: NOW - 60_000,
        lastActiveAtMs: NOW,
        nowMs: NOW,
        syncEnabled: true,
      });
      expect(r).toEqual({ kind: "fresh", reason: "recent-activity" });
    });

    it("exactly threshold ago → fresh (boundary inclusive)", () => {
      const r = deriveResumeGateState({
        startedAtMs: NOW - 60 * 60_000,
        lastActiveAtMs: NOW - RESUME_GATE_STALENESS_MS,
        nowMs: NOW,
        syncEnabled: true,
      });
      expect(r.kind).toBe("fresh");
    });

    it("1 ms past threshold → stale-after-active", () => {
      const r = deriveResumeGateState({
        startedAtMs: NOW - 60 * 60_000,
        lastActiveAtMs: NOW - RESUME_GATE_STALENESS_MS - 1,
        nowMs: NOW,
        syncEnabled: true,
      });
      expect(r.kind).toBe("stale-after-active");
    });
  });

  describe("just-started bypass (started within threshold, no activity)", () => {
    it("started 30s ago, no activity → fresh", () => {
      const r = deriveResumeGateState({
        startedAtMs: NOW - 30_000,
        lastActiveAtMs: null,
        nowMs: NOW,
        syncEnabled: true,
      });
      expect(r).toEqual({ kind: "fresh", reason: "just-started" });
    });

    it("started exactly at threshold ago, no activity → fresh", () => {
      const r = deriveResumeGateState({
        startedAtMs: NOW - RESUME_GATE_STALENESS_MS,
        lastActiveAtMs: null,
        nowMs: NOW,
        syncEnabled: true,
      });
      expect(r.kind).toBe("fresh");
    });

    it("started 1ms past threshold, no activity → stale-no-join", () => {
      const r = deriveResumeGateState({
        startedAtMs: NOW - RESUME_GATE_STALENESS_MS - 1,
        lastActiveAtMs: null,
        nowMs: NOW,
        syncEnabled: true,
      });
      expect(r.kind).toBe("stale-no-join");
      if (r.kind === "stale-no-join") {
        expect(r.sinceMs).toBe(RESUME_GATE_STALENESS_MS + 1);
      }
    });
  });

  describe("regression: morning tab opened in afternoon", () => {
    it("session started 3h ago, last activity 2h ago → stale-after-active", () => {
      const threeHours = 3 * 60 * 60_000;
      const twoHours = 2 * 60 * 60_000;
      const r = deriveResumeGateState({
        startedAtMs: NOW - threeHours,
        lastActiveAtMs: NOW - twoHours,
        nowMs: NOW,
        syncEnabled: true,
      });
      expect(r.kind).toBe("stale-after-active");
      if (r.kind === "stale-after-active") {
        expect(r.sinceMs).toBe(twoHours);
      }
    });

    it("session started 4h ago, never had activity → stale-no-join", () => {
      const fourHours = 4 * 60 * 60_000;
      const r = deriveResumeGateState({
        startedAtMs: NOW - fourHours,
        lastActiveAtMs: null,
        nowMs: NOW,
        syncEnabled: true,
      });
      expect(r.kind).toBe("stale-no-join");
      if (r.kind === "stale-no-join") {
        expect(r.sinceMs).toBe(fourHours);
      }
    });
  });

  describe("threshold override (future tunability)", () => {
    it("custom shorter threshold gates a session that would otherwise be fresh", () => {
      const r = deriveResumeGateState({
        startedAtMs: NOW - 5 * 60_000, // 5 min ago
        lastActiveAtMs: null,
        nowMs: NOW,
        syncEnabled: true,
        stalenessMs: 60_000, // 1 min threshold
      });
      expect(r.kind).toBe("stale-no-join");
    });
  });
});

describe("describeResumeGate", () => {
  it("stale-no-join copy mentions 'no student has joined yet'", () => {
    const copy = describeResumeGate({
      kind: "stale-no-join",
      sinceMs: 15 * 60_000,
    });
    expect(copy.headline).toMatch(/Resume/i);
    expect(copy.body).toMatch(/no student has joined/i);
    expect(copy.body).toMatch(/15 minutes/);
  });

  it("stale-after-active copy mentions 'no activity'", () => {
    const copy = describeResumeGate({
      kind: "stale-after-active",
      sinceMs: 30 * 60_000,
    });
    expect(copy.body).toMatch(/no activity/i);
    expect(copy.body).toMatch(/30 minutes/);
  });

  it("singular 'minute' for sinceMs < 2 minutes", () => {
    const copy = describeResumeGate({
      kind: "stale-no-join",
      sinceMs: 90_000, // 1.5 min → floors to 1
    });
    expect(copy.body).toMatch(/1 minute(?!s)/);
  });

  it("clamps to at least 1 minute (no '0 minutes' nonsense for sub-minute gaps)", () => {
    // The gate shouldn't even fire under a minute, but if a custom
    // threshold puts us here, render '1 minute' rather than '0 minutes'.
    const copy = describeResumeGate({
      kind: "stale-after-active",
      sinceMs: 30_000, // 30 s
    });
    expect(copy.body).toMatch(/1 minute/);
  });
});
