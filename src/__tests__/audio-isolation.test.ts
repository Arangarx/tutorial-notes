/**
 * Multi-tenant isolation tests for audio actions.
 *
 * - transcribeAndGenerateAction: tutor A cannot transcribe for tutor B's student.
 * - Upload route: tested at the unit level via the action; route-level isolation
 *   is tested in the onBeforeGenerateToken callback (covered by the route code).
 *
 * Runs as unit tests (mocks session + DB + transcribe + generate) — no live DB required.
 */

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

const mockGetAdminByEmail = jest.fn();
jest.mock("@/lib/auth-db", () => ({
  getAdminByEmail: (...args: unknown[]) => mockGetAdminByEmail(...args),
}));

const mockStudentFindUnique = jest.fn();
const mockStudentFindUniqueOrThrow = jest.fn();
const mockNoteFindFirst = jest.fn();
const mockRecordingCreate = jest.fn();
const mockRecordingUpdate = jest.fn();
const mockRecordingDelete = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    student: {
      findUnique: (...args: unknown[]) => mockStudentFindUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockStudentFindUniqueOrThrow(...args),
    },
    sessionNote: {
      findFirst: (...args: unknown[]) => mockNoteFindFirst(...args),
    },
    sessionRecording: {
      create: (...args: unknown[]) => mockRecordingCreate(...args),
      update: (...args: unknown[]) => mockRecordingUpdate(...args),
      delete: (...args: unknown[]) => mockRecordingDelete(...args),
    },
  },
  withDbRetry: (fn: () => unknown) => Promise.resolve(fn()),
  isTransientDbConnectionError: () => false,
}));

const mockTranscribeAudio = jest.fn();
jest.mock("@/lib/transcribe", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
  WHISPER_MAX_BYTES: 25 * 1024 * 1024,
}));

const mockGenerateSessionNote = jest.fn();
jest.mock("@/lib/ai", () => ({
  generateSessionNote: (...args: unknown[]) => mockGenerateSessionNote(...args),
  estimateTokens: (text: string) => Math.ceil(text.length / 4),
  MAX_INPUT_TOKENS: 4000,
}));

/** Must return a Promise — production code chains `.catch` on deleteBlob. */
const mockDeleteBlob = jest.fn((..._args: unknown[]) => Promise.resolve(undefined));
jest.mock("@/lib/blob", () => ({
  getAudioUrl: jest.fn().mockReturnValue("https://test.public.blob.vercel-storage.com/audio.webm?download=1"),
  getBlobMetadata: jest.fn().mockResolvedValue({ size: 1024, contentType: "audio/webm" }),
  deleteBlob: (...args: unknown[]) => mockDeleteBlob(...args),
  isBlobConfigured: jest.fn().mockReturnValue(true),
  isAcceptedAudioType: jest.fn().mockReturnValue(true),
  BLOB_MAX_BYTES: 100 * 1024 * 1024,
}));

// Mock global fetch used to download blob bytes.
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(1024),
});

import { transcribeAndGenerateAction } from "@/app/admin/students/[id]/actions";

const USER_A_ID = "user-a-id";
const USER_A_EMAIL = "tutor-a@example.com";
const USER_B_ID = "user-b-id";
const USER_B_STUDENT_ID = "student-of-b";
const USER_A_STUDENT_ID = "student-of-a";
const BLOB_URL = "https://abc123.public.blob.vercel-storage.com/session.webm";

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteBlob.mockImplementation((..._args: unknown[]) => Promise.resolve(undefined));

  mockGetServerSession.mockResolvedValue({ user: { email: USER_A_EMAIL } });
  mockGetAdminByEmail.mockResolvedValue({ id: USER_A_ID, email: USER_A_EMAIL });
});

describe("transcribeAndGenerateAction — multi-tenant isolation", () => {
  test("tutor A cannot transcribe for tutor B's student", async () => {
    // Student belongs to user B.
    mockStudentFindUnique.mockResolvedValue({
      id: USER_B_STUDENT_ID,
      adminUserId: USER_B_ID,
    });

    await expect(
      transcribeAndGenerateAction(USER_B_STUDENT_ID, [{ blobUrl: BLOB_URL, mimeType: "audio/webm" }])
    ).resolves.toMatchObject({ ok: false });

    expect(mockRecordingCreate).not.toHaveBeenCalled();
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    expect(mockGenerateSessionNote).not.toHaveBeenCalled();
  });

  test("tutor A can transcribe for their own student (positive case)", async () => {
    mockStudentFindUnique.mockResolvedValue({
      id: USER_A_STUDENT_ID,
      adminUserId: USER_A_ID,
    });
    const recCreatedAt = new Date("2026-04-20T22:30:00.000Z");
    mockRecordingCreate.mockResolvedValue({ id: "recording-1", createdAt: recCreatedAt });
    mockRecordingUpdate.mockResolvedValue({});
    mockTranscribeAudio.mockResolvedValue({
      transcript: "We covered quadratics today.",
      durationSeconds: 1800,
    });
    mockStudentFindUniqueOrThrow.mockResolvedValue({ name: "Alex" });
    mockNoteFindFirst.mockResolvedValue(null);
    mockGenerateSessionNote.mockResolvedValue({
      topics: "Quadratics",
      homework: "Practice problems p.42",
      assessment: "",
      plan: "Graphing quadratics",
      links: "",
      promptVersion: "2026-04-20-v6",
    });

    const result = await transcribeAndGenerateAction(
      USER_A_STUDENT_ID,
      [{ blobUrl: BLOB_URL, mimeType: "audio/webm" }]
    );

    expect(result).toMatchObject({
      ok: true,
      recordingIds: ["recording-1"],
      topics: "Quadratics",
      // 1800s before recCreatedAt = 22:00:00.000Z; createdAt itself = 22:30:00.000Z.
      sessionStartedAt: "2026-04-20T22:00:00.000Z",
      sessionEndedAt: "2026-04-20T22:30:00.000Z",
    });
    expect(mockRecordingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: USER_A_ID,
          studentId: USER_A_STUDENT_ID,
        }),
      })
    );
    expect(mockTranscribeAudio).toHaveBeenCalledTimes(1);
    expect(mockGenerateSessionNote).toHaveBeenCalledTimes(1);
  });

  test("rejects non-Vercel blob URL", async () => {
    mockStudentFindUnique.mockResolvedValue({
      id: USER_A_STUDENT_ID,
      adminUserId: USER_A_ID,
    });

    const result = await transcribeAndGenerateAction(
      USER_A_STUDENT_ID,
      [{ blobUrl: "https://evil.example.com/audio.webm", mimeType: "audio/webm" }]
    );

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Invalid") });
    expect(mockRecordingCreate).not.toHaveBeenCalled();
  });

  test("returns ok:false with actionable error when transcript is blank", async () => {
    mockStudentFindUnique.mockResolvedValue({
      id: USER_A_STUDENT_ID,
      adminUserId: USER_A_ID,
    });
    mockRecordingCreate.mockResolvedValue({ id: "recording-2", createdAt: new Date("2026-04-20T22:30:00.000Z") });
    mockRecordingUpdate.mockResolvedValue({});
    mockTranscribeAudio.mockResolvedValue({ transcript: "   ", durationSeconds: 10 });

    const result = await transcribeAndGenerateAction(
      USER_A_STUDENT_ID,
      [{ blobUrl: BLOB_URL, mimeType: "audio/webm" }]
    );

    // Empty transcript → ok:false with an actionable error message (not a silent "Form filled"
    // with blank fields — that was Sarah's original bug, fixed in transcribe-result.ts).
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/couldn't detect clear speech|microphone permission/i),
    });
    expect(mockGenerateSessionNote).not.toHaveBeenCalled();
    expect(mockDeleteBlob).toHaveBeenCalled();
    expect(mockRecordingDelete).toHaveBeenCalled();
  });

  test("partial silent segment: skips bad one, keeps good ones, surfaces warning (no hard fail)", async () => {
    // Reproduces Andrew's "I accidentally stopped one without it but left it intentionally"
    // scenario: two recordings, second one is silent / hallucinated. Old behavior bailed the
    // entire batch with the scary mic error. New behavior keeps the good segment, deletes the
    // bad one, and surfaces a non-fatal warning.
    mockStudentFindUnique.mockResolvedValue({
      id: USER_A_STUDENT_ID,
      adminUserId: USER_A_ID,
    });
    const goodCreatedAt = new Date("2026-04-20T22:30:00.000Z");
    const badCreatedAt = new Date("2026-04-20T22:31:00.000Z");
    mockRecordingCreate
      .mockResolvedValueOnce({ id: "rec-good", createdAt: goodCreatedAt })
      .mockResolvedValueOnce({ id: "rec-bad", createdAt: badCreatedAt });
    mockRecordingUpdate.mockResolvedValue({});
    mockTranscribeAudio
      .mockResolvedValueOnce({
        transcript: "We worked on quadratic equations and factoring practice today.",
        durationSeconds: 1800,
      })
      // Second segment: known Whisper hallucination on silence — early guard catches it.
      .mockResolvedValueOnce({
        transcript: "Thank you for watching.",
        durationSeconds: 4,
      });
    mockStudentFindUniqueOrThrow.mockResolvedValue({ name: "Alex" });
    mockNoteFindFirst.mockResolvedValue(null);
    mockGenerateSessionNote.mockResolvedValue({
      topics: "Quadratics",
      homework: "Practice problems p.42",
      assessment: "",
      plan: "Graphing quadratics",
      links: "",
      promptVersion: "v-test",
    });

    const result = await transcribeAndGenerateAction(USER_A_STUDENT_ID, [
      { blobUrl: BLOB_URL, mimeType: "audio/webm" },
      { blobUrl: "https://abc123.public.blob.vercel-storage.com/session-2.webm", mimeType: "audio/webm" },
    ]);

    expect(result).toMatchObject({
      ok: true,
      recordingIds: ["rec-good"],
      topics: "Quadratics",
      warning: expect.stringMatching(/no clear audio|skipped/i),
      // Skipped segment must NOT pull sessionEndedAt forward to 22:31. The end
      // time should be the good segment's createdAt (22:30), not the bad one's.
      sessionStartedAt: "2026-04-20T22:00:00.000Z",
      sessionEndedAt: "2026-04-20T22:30:00.000Z",
    });
    // The bad segment's blob + DB row got cleaned up.
    expect(mockDeleteBlob).toHaveBeenCalledWith(
      "https://abc123.public.blob.vercel-storage.com/session-2.webm"
    );
    expect(mockRecordingDelete).toHaveBeenCalledWith({ where: { id: "rec-bad" } });
    // The good segment's blob is NOT deleted.
    expect(mockDeleteBlob).not.toHaveBeenCalledWith(BLOB_URL);
    // LLM still ran on the good segment's transcript.
    expect(mockGenerateSessionNote).toHaveBeenCalledTimes(1);
  });

  test("every segment silent: still hard-fails with mic message", async () => {
    mockStudentFindUnique.mockResolvedValue({
      id: USER_A_STUDENT_ID,
      adminUserId: USER_A_ID,
    });
    mockRecordingCreate
      .mockResolvedValueOnce({ id: "rec-bad-1", createdAt: new Date("2026-04-20T22:30:00.000Z") })
      .mockResolvedValueOnce({ id: "rec-bad-2", createdAt: new Date("2026-04-20T22:31:00.000Z") });
    mockRecordingUpdate.mockResolvedValue({});
    mockTranscribeAudio.mockResolvedValue({
      transcript: "Thank you for watching.",
      durationSeconds: 3,
    });

    const result = await transcribeAndGenerateAction(USER_A_STUDENT_ID, [
      { blobUrl: BLOB_URL, mimeType: "audio/webm" },
      { blobUrl: "https://abc123.public.blob.vercel-storage.com/session-2.webm", mimeType: "audio/webm" },
    ]);

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/couldn't detect clear speech|microphone permission/i),
    });
    // Both bad segments cleaned up.
    expect(mockRecordingDelete).toHaveBeenCalledTimes(2);
    expect(mockGenerateSessionNote).not.toHaveBeenCalled();
  });

});
