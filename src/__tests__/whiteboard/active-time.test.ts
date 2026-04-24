/**
 * Pure-function tests for the Wyzant-style billable-timer math.
 *
 * Sarah's "the timer should pause when the student isn't there"
 * requirement reduces to: gaps in heartbeats above the staleness
 * threshold MUST NOT be added to `activeMs`. These tests pin that
 * rule plus the other edge cases the API route relies on
 * (clock-skew clamps, fresh segment vs in-progress segment, etc.).
 *
 * `computeDisplayActiveMs` is the read-side mirror — it lets the
 * on-screen pill keep ticking between heartbeats without re-introducing
 * the "ran while student was gone" bug.
 */

import {
  ACTIVE_PING_STALE_MS,
  computeActivePingUpdate,
  computeDisplayActiveMs,
} from "@/lib/whiteboard/active-time";

describe("computeActivePingUpdate", () => {
  const now = 1_700_000_000_000; // arbitrary fixed epoch ms

  it("first positive ping starts a segment but credits 0 ms", () => {
    const r = computeActivePingUpdate({
      nowMs: now,
      active: true,
      prevActiveMs: 0,
      prevLastActiveAtMs: null,
      prevBothConnectedAtMs: null,
    });
    expect(r.activeMs).toBe(0);
    expect(r.creditedMs).toBe(0);
    expect(r.lastActiveAtMs).toBe(now);
    // Stamps the legacy "first overlap" anchor on the first positive ping.
    expect(r.bothConnectedAtMs).toBe(now);
  });

  it("subsequent positive ping within the staleness threshold credits the gap", () => {
    const gap = 8_000;
    const r = computeActivePingUpdate({
      nowMs: now,
      active: true,
      prevActiveMs: 1_000,
      prevLastActiveAtMs: now - gap,
      prevBothConnectedAtMs: now - 60_000,
    });
    expect(r.creditedMs).toBe(gap);
    expect(r.activeMs).toBe(1_000 + gap);
    expect(r.lastActiveAtMs).toBe(now);
    // bothConnectedAt is preserved (not re-stamped to now).
    expect(r.bothConnectedAtMs).toBe(now - 60_000);
  });

  it("positive ping after a stale gap starts a fresh segment without crediting", () => {
    const gap = ACTIVE_PING_STALE_MS + 5_000;
    const r = computeActivePingUpdate({
      nowMs: now,
      active: true,
      prevActiveMs: 30_000,
      prevLastActiveAtMs: now - gap,
      prevBothConnectedAtMs: now - 600_000,
    });
    expect(r.creditedMs).toBe(0);
    expect(r.activeMs).toBe(30_000); // unchanged
    expect(r.lastActiveAtMs).toBe(now); // fresh segment starts now
  });

  it("negative gap (clock skew) clamps to 0 — never subtracts from activeMs", () => {
    const r = computeActivePingUpdate({
      nowMs: now,
      active: true,
      prevActiveMs: 5_000,
      prevLastActiveAtMs: now + 10_000, // future timestamp
      prevBothConnectedAtMs: now - 1_000,
    });
    expect(r.creditedMs).toBe(0);
    expect(r.activeMs).toBe(5_000);
    expect(r.lastActiveAtMs).toBe(now);
  });

  it("negative ping closes an in-progress segment and credits the final delta", () => {
    const gap = 5_000;
    const r = computeActivePingUpdate({
      nowMs: now,
      active: false,
      prevActiveMs: 12_000,
      prevLastActiveAtMs: now - gap,
      prevBothConnectedAtMs: now - 60_000,
    });
    expect(r.creditedMs).toBe(gap);
    expect(r.activeMs).toBe(12_000 + gap);
    expect(r.lastActiveAtMs).toBeNull();
  });

  it("negative ping with no segment in progress is a no-op", () => {
    const r = computeActivePingUpdate({
      nowMs: now,
      active: false,
      prevActiveMs: 12_000,
      prevLastActiveAtMs: null,
      prevBothConnectedAtMs: now - 60_000,
    });
    expect(r.creditedMs).toBe(0);
    expect(r.activeMs).toBe(12_000);
    expect(r.lastActiveAtMs).toBeNull();
  });

  it("negative ping after a stale gap closes the segment without crediting", () => {
    const gap = ACTIVE_PING_STALE_MS + 60_000;
    const r = computeActivePingUpdate({
      nowMs: now,
      active: false,
      prevActiveMs: 12_000,
      prevLastActiveAtMs: now - gap,
      prevBothConnectedAtMs: now - 600_000,
    });
    // The closed-tab gap was bigger than the staleness window, so the
    // tutor isn't billed for it. Crucial Sarah-correctness invariant.
    expect(r.creditedMs).toBe(0);
    expect(r.activeMs).toBe(12_000);
    expect(r.lastActiveAtMs).toBeNull();
  });

  it("negative ping never resurrects a never-set bothConnectedAt", () => {
    const r = computeActivePingUpdate({
      nowMs: now,
      active: false,
      prevActiveMs: 0,
      prevLastActiveAtMs: null,
      prevBothConnectedAtMs: null,
    });
    expect(r.bothConnectedAtMs).toBeNull();
  });

  it("respects a custom staleness threshold", () => {
    const r = computeActivePingUpdate({
      nowMs: now,
      active: true,
      prevActiveMs: 1_000,
      prevLastActiveAtMs: now - 20_000,
      prevBothConnectedAtMs: now - 60_000,
      staleThresholdMs: 10_000, // tighter than default
    });
    expect(r.creditedMs).toBe(0); // 20s gap exceeds 10s window
  });
});

describe("computeDisplayActiveMs", () => {
  const now = 1_700_000_000_000;

  it("returns the persisted total verbatim while paused", () => {
    expect(
      computeDisplayActiveMs({
        nowMs: now,
        serverActiveMs: 30_000,
        serverLastActiveAtMs: null,
        clientActiveNow: false,
      })
    ).toBe(30_000);
  });

  it("returns persisted total verbatim while active but server has no anchor yet", () => {
    expect(
      computeDisplayActiveMs({
        nowMs: now,
        serverActiveMs: 30_000,
        serverLastActiveAtMs: null,
        clientActiveNow: true,
      })
    ).toBe(30_000);
  });

  it("ticks forward between heartbeats while active", () => {
    expect(
      computeDisplayActiveMs({
        nowMs: now,
        serverActiveMs: 30_000,
        serverLastActiveAtMs: now - 4_000,
        clientActiveNow: true,
      })
    ).toBe(34_000);
  });

  it("does NOT tick when the client claims active but the server anchor is stale", () => {
    // Defensive: if the server hasn't seen a fresh ping in over the
    // staleness window, displaying serverActiveMs + huge-gap would
    // be a lie. Snap back to the persisted total.
    expect(
      computeDisplayActiveMs({
        nowMs: now,
        serverActiveMs: 30_000,
        serverLastActiveAtMs: now - (ACTIVE_PING_STALE_MS + 10_000),
        clientActiveNow: true,
      })
    ).toBe(30_000);
  });

  it("snaps to serverActiveMs while paused even if the server anchor looks fresh", () => {
    // A `false` ping sets lastActiveAt = null, so this only happens
    // mid-flight (we received an active=false from the user but the
    // most recent successful read still had the anchor). Don't tick.
    expect(
      computeDisplayActiveMs({
        nowMs: now,
        serverActiveMs: 30_000,
        serverLastActiveAtMs: now - 4_000,
        clientActiveNow: false,
      })
    ).toBe(30_000);
  });

  it("clamps negative gaps (server clock ahead of client) to the persisted total", () => {
    expect(
      computeDisplayActiveMs({
        nowMs: now,
        serverActiveMs: 30_000,
        serverLastActiveAtMs: now + 5_000, // future
        clientActiveNow: true,
      })
    ).toBe(30_000);
  });
});
