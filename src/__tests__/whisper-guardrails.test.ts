import { looksLikeSilenceHallucination } from "@/lib/whisper-guardrails";

describe("looksLikeSilenceHallucination", () => {
  test("flags classic YouTube-style Whisper hallucination", () => {
    expect(
      looksLikeSilenceHallucination(
        "thanks for watching please subscribe and hit that like button....",
        5
      )
    ).toBe(true);
  });

  test("does not flag a normal short tutoring phrase", () => {
    expect(
      looksLikeSilenceHallucination(
        "We reviewed factoring and she had trouble with negative signs.",
        45
      )
    ).toBe(false);
  });

  test("flags empty transcript", () => {
    expect(looksLikeSilenceHallucination("", 0)).toBe(true);
  });

  /** Sarah Apr 2026 — Neon transcript exact match; Whisper hallucination on weak audio. */
  test('flags "Thank you for watching." (23 chars)', () => {
    expect(looksLikeSilenceHallucination("Thank you for watching.", 23)).toBe(true);
  });
});
