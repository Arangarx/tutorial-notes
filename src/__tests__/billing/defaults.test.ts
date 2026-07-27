/**
 * @jest-environment node
 */

import {
  DEFAULT_ROUNDING_INCREMENT_MIN,
  DEFAULT_ROUNDING_MODE,
  DEFAULT_TUTOR_TIMEZONE,
  normalizeRoundingIncrement,
  normalizeRoundingMode,
} from "@/lib/billing/defaults";

describe("billing defaults", () => {
  it("defaults rounding direction to up for new tutors", () => {
    expect(DEFAULT_ROUNDING_MODE).toBe("up");
  });

  it("defaults rounding increment to 5-minute buckets (Sarah)", () => {
    expect(DEFAULT_ROUNDING_INCREMENT_MIN).toBe(5);
  });

  it("defaults tutor timezone to America/Denver when unset", () => {
    expect(DEFAULT_TUTOR_TIMEZONE).toBe("America/Denver");
  });

  it("normalizeRoundingMode falls back to default for invalid values", () => {
    expect(normalizeRoundingMode(null)).toBe(DEFAULT_ROUNDING_MODE);
    expect(normalizeRoundingMode("invalid")).toBe(DEFAULT_ROUNDING_MODE);
    expect(normalizeRoundingMode("nearest")).toBe("nearest");
  });

  it("normalizeRoundingIncrement falls back to default for invalid values", () => {
    expect(normalizeRoundingIncrement(null)).toBe(DEFAULT_ROUNDING_INCREMENT_MIN);
    expect(normalizeRoundingIncrement(7)).toBe(DEFAULT_ROUNDING_INCREMENT_MIN);
    expect(normalizeRoundingIncrement(15)).toBe(15);
  });
});
