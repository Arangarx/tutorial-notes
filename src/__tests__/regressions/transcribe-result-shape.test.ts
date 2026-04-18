/**
 * Regression tests for buildTranscribeAndGenerateResult.
 *
 * Sarah's bug: her recorded session showed "Form filled — review and save."
 * with every form field blank. Root cause: when Whisper returned an empty
 * transcript OR generateSessionNote errored, the action returned ok:true with
 * empty topics/homework/nextSteps/links. The AI panel populated the form with
 * nothing and transitioned to the success state.
 *
 * Contract being locked in:
 *  - empty transcript           -> ok:false with actionable error
 *  - AI gen errors              -> ok:true, transcript dropped into topics, warning set
 *  - AI returns all-empty fields-> ok:true, transcript dropped into topics, warning set
 *  - happy path                 -> ok:true with structured fields, no warning
 *
 * Note: `recordingId` was renamed to `recordingIds: string[]` in Phase 1
 * (multi-recording support). Tests updated accordingly.
 */

// Pure helper — no module mocks needed. Lives in its own file because
// Next.js disallows non-async exports from a "use server" file.
import { buildTranscribeAndGenerateResult } from "@/app/admin/students/[id]/transcribe-result";

describe("buildTranscribeAndGenerateResult", () => {
  test("empty transcript returns ok:false with silent-recording error", () => {
    const r = buildTranscribeAndGenerateResult({
      recordingIds: ["rec1"],
      trimmedTranscript: "",
      rawTranscript: "   ",
      genResult: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.toLowerCase()).toMatch(/silent|too quiet|couldn't make out/);
    }
  });

  test("AI gen error: transcript goes into topics, warning is set, recordings attached", () => {
    const r = buildTranscribeAndGenerateResult({
      recordingIds: ["rec1"],
      trimmedTranscript: "We worked on long division and she got 4/5 right.",
      rawTranscript: "  We worked on long division and she got 4/5 right.  ",
      genResult: { error: "rate limit" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recordingIds).toEqual(["rec1"]);
      expect(r.topics).toBe("We worked on long division and she got 4/5 right.");
      expect(r.homework).toBe("");
      expect(r.nextSteps).toBe("");
      expect(r.links).toBe("");
      expect(r.warning).toBeTruthy();
      expect(r.warning!.toLowerCase()).toMatch(/transcribed|raw transcript/);
    }
  });

  test("AI returns all-empty fields: still warn + drop transcript into topics", () => {
    const r = buildTranscribeAndGenerateResult({
      recordingIds: ["rec2"],
      trimmedTranscript: "Reviewed phonics for 20 minutes.",
      rawTranscript: "Reviewed phonics for 20 minutes.",
      genResult: {
        topics: "",
        homework: "  ",
        nextSteps: "",
        links: "",
        promptVersion: "v1",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.topics).toBe("Reviewed phonics for 20 minutes.");
      expect(r.warning).toBeTruthy();
      expect(r.promptVersion).toBe("v1");
    }
  });

  test("happy path: structured fields preserved, no warning", () => {
    const r = buildTranscribeAndGenerateResult({
      recordingIds: ["rec3"],
      trimmedTranscript: "raw text",
      rawTranscript: "raw text",
      genResult: {
        topics: "Quadratics",
        homework: "Worksheet pg 4",
        nextSteps: "Practice negatives",
        links: "https://example.com",
        promptVersion: "v2",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.topics).toBe("Quadratics");
      expect(r.homework).toBe("Worksheet pg 4");
      expect(r.nextSteps).toBe("Practice negatives");
      expect(r.links).toBe("https://example.com");
      expect(r.warning).toBeUndefined();
    }
  });

  test("happy path: at least one non-empty field is enough (homework only)", () => {
    const r = buildTranscribeAndGenerateResult({
      recordingIds: ["rec4"],
      trimmedTranscript: "raw",
      rawTranscript: "raw",
      genResult: {
        topics: "",
        homework: "Read chapter 3",
        nextSteps: "",
        links: "",
        promptVersion: "v3",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.homework).toBe("Read chapter 3");
      expect(r.warning).toBeUndefined();
    }
  });

  test("multi-segment: recordingIds contains all segment IDs", () => {
    const r = buildTranscribeAndGenerateResult({
      recordingIds: ["rec-seg1", "rec-seg2"],
      trimmedTranscript: "Part 1 content. Part 2 content.",
      rawTranscript: "Part 1 content. Part 2 content.",
      genResult: {
        topics: "Algebra review",
        homework: "Practice set 3",
        nextSteps: "Start geometry",
        links: "",
        promptVersion: "v2",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recordingIds).toEqual(["rec-seg1", "rec-seg2"]);
      expect(r.topics).toBe("Algebra review");
    }
  });
});
