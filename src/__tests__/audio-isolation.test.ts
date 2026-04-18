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
  withDbRetry: (fn: () => unknown) => fn(),
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

jest.mock("@/lib/blob", () => ({
  getAudioUrl: jest.fn().mockReturnValue("https://test.public.blob.vercel-storage.com/audio.webm?download=1"),
  getBlobMetadata: jest.fn().mockResolvedValue({ size: 1024, contentType: "audio/webm" }),
  deleteBlob: jest.fn().mockResolvedValue(undefined),
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
    mockRecordingCreate.mockResolvedValue({ id: "recording-1" });
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
      nextSteps: "Graphing quadratics",
      promptVersion: "2026-04-16",
    });

    const result = await transcribeAndGenerateAction(
      USER_A_STUDENT_ID,
      [{ blobUrl: BLOB_URL, mimeType: "audio/webm" }]
    );

    expect(result).toMatchObject({
      ok: true,
      recordingIds: ["recording-1"],
      topics: "Quadratics",
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
    mockRecordingCreate.mockResolvedValue({ id: "recording-2" });
    mockRecordingUpdate.mockResolvedValue({});
    mockTranscribeAudio.mockResolvedValue({ transcript: "   ", durationSeconds: 10 });

    const result = await transcribeAndGenerateAction(
      USER_A_STUDENT_ID,
      [{ blobUrl: BLOB_URL, mimeType: "audio/webm" }]
    );

    // Empty transcript → ok:false with an actionable error message (not a silent "Form filled"
    // with blank fields — that was Sarah's original bug, fixed in transcribe-result.ts).
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/silent|too quiet|couldn't make out/i) });
    expect(mockGenerateSessionNote).not.toHaveBeenCalled();
  });
});
