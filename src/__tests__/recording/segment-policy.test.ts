/**
 * Pure thresholds + decision functions for the recorder timer.
 *
 * Goal: lock the rollover/warning/safety semantics so a future tweak (e.g.
 * shortening segments) can't accidentally regress the "fire chime once per
 * segment" guard or the "session safety hard stop" behavior.
 */

import {
  SEGMENT_MAX_SECONDS,
  WARN_SEGMENT_SECONDS,
  SESSION_SAFETY_MAX_SECONDS,
  shouldRolloverSegment,
  shouldFireApproachingChime,
  shouldHardStopSession,
  formatSegmentTimeLeft,
} from "@/lib/recording/segment-policy";

describe("segment-policy thresholds", () => {
  test("WARN_SEGMENT_SECONDS is 5 minutes before the segment cap", () => {
    expect(SEGMENT_MAX_SECONDS - WARN_SEGMENT_SECONDS).toBe(5 * 60);
  });

  test("SESSION_SAFETY_MAX_SECONDS is much larger than a single segment", () => {
    expect(SESSION_SAFETY_MAX_SECONDS).toBeGreaterThan(SEGMENT_MAX_SECONDS * 4);
  });
});

describe("shouldRolloverSegment", () => {
  test("returns false below the cap", () => {
    expect(shouldRolloverSegment(0)).toBe(false);
    expect(shouldRolloverSegment(SEGMENT_MAX_SECONDS - 1)).toBe(false);
  });

  test("returns true exactly at the cap", () => {
    expect(shouldRolloverSegment(SEGMENT_MAX_SECONDS)).toBe(true);
  });

  test("returns true past the cap (in case a tick was missed)", () => {
    expect(shouldRolloverSegment(SEGMENT_MAX_SECONDS + 7)).toBe(true);
  });
});

describe("shouldFireApproachingChime", () => {
  test("returns false before the warning threshold regardless of fired flag", () => {
    expect(shouldFireApproachingChime(WARN_SEGMENT_SECONDS - 1, false)).toBe(false);
    expect(shouldFireApproachingChime(WARN_SEGMENT_SECONDS - 1, true)).toBe(false);
  });

  test("returns true at the warning threshold when not yet fired", () => {
    expect(shouldFireApproachingChime(WARN_SEGMENT_SECONDS, false)).toBe(true);
  });

  test("returns false at the warning threshold when already fired (no replay on resume)", () => {
    expect(shouldFireApproachingChime(WARN_SEGMENT_SECONDS, true)).toBe(false);
  });

  test("stays false past the threshold once fired (single-fire per segment)", () => {
    expect(shouldFireApproachingChime(WARN_SEGMENT_SECONDS + 60, true)).toBe(false);
  });
});

describe("shouldHardStopSession", () => {
  test("returns false below the safety cap", () => {
    expect(shouldHardStopSession(0)).toBe(false);
    expect(shouldHardStopSession(SESSION_SAFETY_MAX_SECONDS - 1)).toBe(false);
  });

  test("returns true at and past the safety cap", () => {
    expect(shouldHardStopSession(SESSION_SAFETY_MAX_SECONDS)).toBe(true);
    expect(shouldHardStopSession(SESSION_SAFETY_MAX_SECONDS + 100)).toBe(true);
  });
});

describe("formatSegmentTimeLeft", () => {
  test("prod copy: minutes wording at 5 min remaining", () => {
    expect(formatSegmentTimeLeft(5 * 60)).toBe("~5 min left");
  });

  test("rounds up to whole minutes (so 4:01 reads as 5 min, not 4)", () => {
    expect(formatSegmentTimeLeft(241)).toBe("~5 min left");
  });

  test("smoke copy: switches to seconds under 90s", () => {
    expect(formatSegmentTimeLeft(30)).toBe("~30s left");
    expect(formatSegmentTimeLeft(89)).toBe("~89s left");
  });

  test("90s exactly uses minute wording (boundary)", () => {
    expect(formatSegmentTimeLeft(90)).toBe("~2 min left");
  });

  test("clamps negative values to 0 (timer overshoot)", () => {
    expect(formatSegmentTimeLeft(-3)).toBe("~0s left");
  });
});
