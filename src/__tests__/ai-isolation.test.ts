/**
 * Multi-tenant isolation test for generateNoteFromTextAction.
 *
 * Verifies that a tutor cannot call generateNoteFromTextAction on a student
 * that belongs to another tutor. Per docs/learning-multi-tenant.md — this
 * type of test must exist for every action that touches student data.
 *
 * Runs as a unit test (mocks session + DB) — no live database required.
 */

// Must set up mocks before importing the module under test.

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

const mockGetAdminByEmail = jest.fn();
jest.mock("@/lib/auth-db", () => ({
  getAdminByEmail: (...args: unknown[]) => mockGetAdminByEmail(...args),
}));

const mockFindUnique = jest.fn();
const mockFindUniqueOrThrow = jest.fn();
const mockFindMany = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    student: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
    },
    sessionNote: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

const mockGenerateSessionNote = jest.fn();
jest.mock("@/lib/ai", () => ({
  generateSessionNote: (...args: unknown[]) => mockGenerateSessionNote(...args),
  estimateTokens: (text: string) => Math.ceil(text.length / 4),
  MAX_INPUT_TOKENS: 4000,
}));

import { generateNoteFromTextAction } from "@/app/admin/students/[id]/actions";

const USER_A_ID = "user-a-id";
const USER_A_EMAIL = "tutor-a@example.com";
const USER_B_STUDENT_ID = "student-belongs-to-b";
const USER_B_ID = "user-b-id";

beforeEach(() => {
  jest.clearAllMocks();

  // Default: session is for user A
  mockGetServerSession.mockResolvedValue({
    user: { email: USER_A_EMAIL },
  });

  // User A's admin record
  mockGetAdminByEmail.mockResolvedValue({
    id: USER_A_ID,
    email: USER_A_EMAIL,
  });
});

test("tutor A cannot generate a note for tutor B's student (isolation)", async () => {
  // Student belongs to user B — user A must be denied.
  mockFindUnique.mockResolvedValue({
    id: USER_B_STUDENT_ID,
    adminUserId: USER_B_ID, // belongs to B, not A
  });

  // next/navigation notFound() throws — mimic that here so the test catches it.
  // The action calls assertOwnsStudent → canAccessStudentRow → notFound().
  // next/navigation is mocked by Next.js jest setup to throw "NEXT_NOT_FOUND".
  await expect(
    generateNoteFromTextAction(USER_B_STUDENT_ID, "Some session text about fractions.")
  ).rejects.toThrow();

  // OpenAI must NOT have been called
  expect(mockGenerateSessionNote).not.toHaveBeenCalled();
});

test("tutor A can generate a note for their own student (positive case)", async () => {
  // Student belongs to user A — access allowed.
  mockFindUnique.mockResolvedValue({
    id: "user-a-student-id",
    adminUserId: USER_A_ID,
  });

  mockFindUniqueOrThrow.mockResolvedValue({ name: "Alex" });
  mockFindMany.mockResolvedValue([]);
  mockGenerateSessionNote.mockResolvedValue({
    topics: "Fractions",
    homework: "Worksheet 2",
    nextSteps: "Word problems",
    promptVersion: "2026-04-16",
  });

  const result = await generateNoteFromTextAction(
    "user-a-student-id",
    "We worked on fractions today."
  );

  expect(result).toMatchObject({ ok: true, topics: "Fractions" });
  expect(mockGenerateSessionNote).toHaveBeenCalledTimes(1);
});
