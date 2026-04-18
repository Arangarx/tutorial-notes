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
 */

// The action module imports next-auth, prisma, vercel/blob, etc. Those would
// load at test time unless we mock them. We only need the pure helper.
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/auth-options", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({
  db: {},
  withDbRetry: <T>(fn: () => Promise<T>) => fn(),
  isTransientDbConnectionError: () => false,
}));
jest.mock("@/lib/auth-db", () => ({ getAdminByEmail: jest.fn() }));
jest.mock("@/lib/email", () => ({ sendMail: jest.fn() }));
jest.mock("@/lib/security", () => ({
  generateShareToken: jest.fn(() => "tok"),
  parseLinksFromTextarea: jest.fn(() => []),
}));
jest.mock("@/lib/student-scope", () => ({
  assertOwnsStudent: jest.fn(),
  requireStudentScope: jest.fn(),
}));
jest.mock("@/lib/ai", () => ({
  generateSessionNote: jest.fn(),
  estimateTokens: jest.fn(() => 0),
  MAX_INPUT_TOKENS: 4000,
}));
jest.mock("@/lib/transcribe", () => ({ transcribeAudio: jest.fn() }));
jest.mock("@vercel/blob", () => ({ put: jest.fn() }));
jest.mock("@/lib/blob", () => ({
  getAudioUrl: jest.fn(),
  getBlobMetadata: jest.fn(),
  deleteBlob: jest.fn(),
  BLOB_MAX_BYTES: 100 * 1024 * 1024,
}));

import { buildTranscribeAndGenerateResult } from "@/app/admin/students/[id]/actions";

describe("buildTranscribeAndGenerateResult", () => {
  test("empty transcript returns ok:false with silent-recording error", () => {
    const r = buildTranscribeAndGenerateResult({
      recordingId: "rec1",
      trimmedTranscript: "",
      rawTranscript: "   ",
      genResult: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.toLowerCase()).toMatch(/silent|too quiet|couldn't make out/);
    }
  });

  test("AI gen error: transcript goes into topics, warning is set, recording attached", () => {
    const r = buildTranscribeAndGenerateResult({
      recordingId: "rec1",
      trimmedTranscript: "We worked on long division and she got 4/5 right.",
      rawTranscript: "  We worked on long division and she got 4/5 right.  ",
      genResult: { error: "rate limit" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recordingId).toBe("rec1");
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
      recordingId: "rec2",
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
      recordingId: "rec3",
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
      recordingId: "rec4",
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
});
