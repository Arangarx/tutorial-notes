import {
  TIME_INPUT_STEP_SECONDS,
  formatLocalTimeSnapped,
  formatUtcTimeSnapped,
} from "@/lib/time/snap";

/**
 * Sarah-feedback regression: time pickers must use 5-minute increments,
 * AND prefilled / historical values must snap onto the same grid so
 * HTML5 `step` validation doesn't reject them on submit.
 *
 * If anyone changes the grid (e.g. back to 1-min for "precision") this
 * suite will fail and force them to also revisit Wyzant-parity intent.
 */
describe("time/snap — 5-minute grid for tutor time inputs", () => {
  it("ships a 5-minute step constant (300 seconds)", () => {
    expect(TIME_INPUT_STEP_SECONDS).toBe(300);
  });

  describe("formatUtcTimeSnapped", () => {
    it("returns empty for null", () => {
      expect(formatUtcTimeSnapped(null)).toBe("");
    });

    it("leaves on-grid values alone", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 10, 55, 0));
      expect(formatUtcTimeSnapped(d)).toBe("10:55");
    });

    it("snaps a 10:53 end time UP to 10:55 (Sarah's exact case)", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 10, 53, 0));
      expect(formatUtcTimeSnapped(d)).toBe("10:55");
    });

    it("snaps a 10:52 end time DOWN to 10:50", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 10, 52, 0));
      expect(formatUtcTimeSnapped(d)).toBe("10:50");
    });

    it("rolls 23:58 over to 00:00 cleanly (no NaN, no negative)", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 23, 58, 0));
      expect(formatUtcTimeSnapped(d)).toBe("00:00");
    });

    it("zero-pads single-digit hours and minutes", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 4, 2, 0));
      expect(formatUtcTimeSnapped(d)).toBe("04:00");
    });
  });

  describe("formatLocalTimeSnapped", () => {
    it("returns empty for null", () => {
      expect(formatLocalTimeSnapped(null)).toBe("");
    });

    it("returns empty for an invalid Date", () => {
      expect(formatLocalTimeSnapped(new Date("not a date"))).toBe("");
    });

    it("snaps using LOCAL hours/minutes (not UTC)", () => {
      // Build a Date whose LOCAL wall-clock is 14:53 regardless of the
      // host's TZ, then assert the snap landed on 14:55. Using the
      // local-time constructor ensures Date#getHours/getMinutes return
      // 14/53 even on CI runners in UTC.
      const d = new Date(2026, 3, 22, 14, 53, 0);
      expect(formatLocalTimeSnapped(d)).toBe("14:55");
    });
  });
});
