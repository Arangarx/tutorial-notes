/**
 * Late guard: when the structuring LLM returns all-empty fields but the transcript
 * still matches obvious Whisper junk, the action fails like the early guard and deletes
 * blob + DB rows. Covered with a mocked `looksLikeSilenceHallucination` because the
 * real first check already blocks "Thank you for watching." before the LLM runs.
 */

const mockLooksLikeSilenceHallucination = jest.fn();

jest.mock("@/lib/whisper-guardrails", () => ({
  looksLikeSilenceHallucination: (...args: unknown[]) => mockLooksLikeSilenceHallucination(...args),
}));

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

const mockDeleteBlob = jest.fn((..._args: unknown[]) => Promise.resolve(undefined));
jest.mock("@/lib/blob", () => ({
  getAudioUrl: jest.fn().mockReturnValue("https://test.public.blob.vercel-storage.com/audio.webm?download=1"),
  getBlobMetadata: jest.fn().mockResolvedValue({ size: 1024, contentType: "audio/webm" }),
  deleteBlob: (...args: unknown[]) => mockDeleteBlob(...args),
  isBlobConfigured: jest.fn().mockReturnValue(true),
  isAcceptedAudioType: jest.fn().mockReturnValue(true),
  BLOB_MAX_BYTES: 100 * 1024 * 1024,
}));

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(1024),
});

import { transcribeAndGenerateAction } from "@/app/admin/students/[id]/actions";

const USER_A_ID = "user-a-id";
const USER_A_EMAIL = "tutor-a@example.com";
const USER_A_STUDENT_ID = "student-of-a";
const BLOB_URL = "https://abc123.public.blob.vercel-storage.com/session.webm";

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteBlob.mockImplementation((..._args: unknown[]) => Promise.resolve(undefined));
  mockLooksLikeSilenceHallucination.mockReset();

  mockGetServerSession.mockResolvedValue({ user: { email: USER_A_EMAIL } });
  mockGetAdminByEmail.mockResolvedValue({ id: USER_A_ID, email: USER_A_EMAIL });
});

describe("transcribeAndGenerateAction — late hallucination guard", () => {
  test("all-empty LLM + second-pass junk detection: ok:false and cleanup", async () => {
    mockLooksLikeSilenceHallucination.mockReturnValueOnce(false).mockReturnValue(true);

    mockStudentFindUnique.mockResolvedValue({
      id: USER_A_STUDENT_ID,
      adminUserId: USER_A_ID,
    });
    mockRecordingCreate.mockResolvedValue({
      id: "recording-hallucination",
      createdAt: new Date("2026-04-20T22:30:00.000Z"),
    });
    mockRecordingUpdate.mockResolvedValue({});
    mockTranscribeAudio.mockResolvedValue({
      transcript: "Thank you for watching.",
      durationSeconds: 23,
    });
    mockStudentFindUniqueOrThrow.mockResolvedValue({ name: "Madison" });
    mockNoteFindFirst.mockResolvedValue(null);
    mockGenerateSessionNote.mockResolvedValue({
      topics: "",
      homework: "",
      nextSteps: "",
      links: "",
      promptVersion: "v-test",
    });

    const result = await transcribeAndGenerateAction(USER_A_STUDENT_ID, [
      { blobUrl: BLOB_URL, mimeType: "audio/webm" },
    ]);

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/couldn't detect clear speech|microphone permission/i),
    });
    expect(mockLooksLikeSilenceHallucination).toHaveBeenCalledTimes(2);
    expect(mockDeleteBlob).toHaveBeenCalled();
    expect(mockRecordingDelete).toHaveBeenCalled();
  });
});
