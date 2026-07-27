/**
 * Exact-output locks for duration display formatters.
 *
 * Wave A dedupe: three identical ms→clock copies (replay-helpers,
 * WhiteboardReplay, WhiteboardWorkspaceClient) fold into formatDurationMs.
 * Recording formatDuration(seconds) stays a separate public API but shares
 * the clock core with padMinutes — these locks prove neither surface drifts.
 *
 * Spec = user-visible strings on replay scrubbers / WB chrome / recorder UI.
 * Independent oracle = hand-computed expected strings (not back-derived from
 * implementation helpers).
 */
import { formatClockDuration, formatDurationMs } from "@/lib/time/format-duration-ms";
import { formatDuration } from "@/components/recording/format-duration";
import { formatReplayDurationMs } from "@/lib/whiteboard/replay-helpers";

/** Inputs covering the full display range + fallbacks. */
const MS_CASES: Array<{ ms: number; expected: string; label: string }> = [
  { ms: 0, expected: "0:00", label: "zero" },
  { ms: 1, expected: "0:00", label: "sub-second (1ms)" },
  { ms: 999, expected: "0:00", label: "sub-second (999ms)" },
  { ms: 1000, expected: "0:01", label: "exactly 1s" },
  { ms: 1500, expected: "0:01", label: "1.5s floors to 1s" },
  { ms: 59_000, expected: "0:59", label: "59s" },
  { ms: 60_000, expected: "1:00", label: "exactly 1 min" },
  { ms: 61_000, expected: "1:01", label: "1m1s" },
  { ms: 3_599_000, expected: "59:59", label: "just under 1 hour" },
  { ms: 3_600_000, expected: "1:00:00", label: "exactly 1 hour" },
  { ms: 3_661_000, expected: "1:01:01", label: "1h1m1s" },
  { ms: 7_325_000, expected: "2:02:05", label: "multi-hour" },
  { ms: -500, expected: "0:00", label: "negative fallback" },
];

const RECORDING_SEC_CASES: Array<{
  seconds: number;
  expected: string;
  label: string;
}> = [
  { seconds: 0, expected: "00:00", label: "zero (padded)" },
  { seconds: 1, expected: "00:01", label: "1s padded" },
  { seconds: 59, expected: "00:59", label: "59s padded" },
  { seconds: 60, expected: "01:00", label: "exactly 1 min padded" },
  { seconds: 61, expected: "01:01", label: "1m1s padded" },
  { seconds: 3599, expected: "59:59", label: "just under 1 hour" },
  { seconds: 3600, expected: "1:00:00", label: "exactly 1 hour" },
  { seconds: 3661, expected: "1:01:01", label: "1h1m1s" },
  { seconds: 7325, expected: "2:02:05", label: "multi-hour" },
];

describe("formatClockDuration (unpadded seconds, page-local contract)", () => {
  it.each([
    { seconds: 0, expected: "0:00", label: "zero" },
    { seconds: 61, expected: "1:01", label: "1m1s unpadded" },
    { seconds: 3661, expected: "1:01:01", label: "1h1m1s" },
  ])("$label → $expected", ({ seconds, expected }) => {
    expect(formatClockDuration(seconds, { padMinutes: false })).toBe(expected);
    expect(formatDurationMs(seconds * 1000)).toBe(expected);
  });
});

describe("formatDurationMs (canonical ms→clock, unpadded minutes under 1h)", () => {
  it.each(MS_CASES)("$label → $expected", ({ ms, expected }) => {
    expect(formatDurationMs(ms)).toBe(expected);
  });
});

describe("formatReplayDurationMs re-export stays byte-identical to canonical", () => {
  it.each(MS_CASES)("$label → $expected", ({ ms, expected }) => {
    expect(formatReplayDurationMs(ms)).toBe(expected);
    expect(formatReplayDurationMs(ms)).toBe(formatDurationMs(ms));
  });
});

describe("formatDuration (recording seconds, padded minutes under 1h)", () => {
  it.each(RECORDING_SEC_CASES)("$label → $expected", ({ seconds, expected }) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("differs from ms formatter under 1 hour (padMinutes)", () => {
    // Same wall time, different display contract — must not silently unify.
    expect(formatDuration(60)).toBe("01:00");
    expect(formatDurationMs(60_000)).toBe("1:00");
    expect(formatDuration(60)).not.toBe(formatDurationMs(60_000));
  });
});
