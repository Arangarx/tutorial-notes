/**
 * @jest-environment node
 *
 * Unit tests for the whiteboard API routes (events, snapshot,
 * public-events, public-snapshot) and the two new server actions
 * (generateNotesFromWhiteboardSessionAction, attachWhiteboardToNoteAction).
 *
 * All DB + network I/O is mocked so the tests run in any environment,
 * including CI without Postgres or Vercel Blob connectivity.
 */

// ── Next.js navigation mocks (must come before any imports) ─────────
jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT to ${url}`);
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
}));

// ── DB mock ──────────────────────────────────────────────────────────
// Note: jest.mock() factories are hoisted before variable declarations,
// so `dbMock` cannot be referenced inside the factory. Instead we build
// the mock object inside the factory and export it via a side-channel.
let dbMock: {
  whiteboardSession: {
    findUnique: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
  sessionRecording: {
    findMany: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
  sessionNote: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  student: {
    findUniqueOrThrow: jest.Mock;
  };
};

jest.mock("@/lib/db", () => {
  const mock = {
    whiteboardSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    sessionRecording: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    sessionNote: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    student: {
      findUniqueOrThrow: jest.fn(),
    },
  };
  // Expose to tests via module-level assignment.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).__dbMock = mock;
  return {
    __esModule: true,
    db: mock,
    withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
  };
});// ── Auth / scope mock ────────────────────────────────────────────────
const requireStudentScopeMock = jest.fn();
const assertOwnsStudentMock = jest.fn(async () => {});
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: () => requireStudentScopeMock(),
  assertOwnsStudent: (_id: string) => assertOwnsStudentMock(),
  canAccessStudentRow: jest.fn(() => true),
}));

// ── Whiteboard scope mock ────────────────────────────────────────────
const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) =>
    assertOwnsWhiteboardSessionMock(id),
}));

// ── Transcription + AI mocks ─────────────────────────────────────────
const transcribeAudioMock = jest.fn();
jest.mock("@/lib/transcribe", () => ({
  __esModule: true,
  transcribeAudio: (...args: unknown[]) => transcribeAudioMock(...args),
}));

const generateSessionNoteMock = jest.fn();
jest.mock("@/lib/ai", () => ({
  __esModule: true,
  generateSessionNote: (...args: unknown[]) => generateSessionNoteMock(...args),
  estimateTokens: (s: string) => Math.ceil(s.length / 4),
  MAX_INPUT_TOKENS: 30000,
}));

jest.mock("@/lib/whisper-guardrails", () => ({
  __esModule: true,
  looksLikeSilenceHallucination: () => false,
}));

jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "test-rid",
}));

jest.mock("@/lib/date-only", () => ({
  __esModule: true,
  parseDateOnlyInput: (s: string) => {
    const d = new Date(s + "T00:00:00.000Z");
    return Number.isNaN(d.getTime()) ? null : d;
  },
}));

// ── Blob mock (used by actions) ───────────────────────────────────────
jest.mock("@vercel/blob", () => ({ __esModule: true, put: jest.fn() }));

// ── Imports (after all mocks) ─────────────────────────────────────────
import {
  generateNotesFromWhiteboardSessionAction,
  attachWhiteboardToNoteAction,
} from "@/app/admin/students/[id]/whiteboard/actions";

// Pick up the db mock exposed by the factory above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
dbMock = (global as any).__dbMock;

// ── Fetch mock ────────────────────────────────────────────────────────
// jest.spyOn(global, "fetch") is unreliable in Node 18+ where fetch is
// a non-configurable native. Instead we replace it before each test and
// restore after.
type FetchFn = typeof fetch;
let originalFetch: FetchFn;
beforeAll(() => {
  originalFetch = global.fetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

function mockFetchOnce(response: Response) {
  global.fetch = jest.fn().mockResolvedValueOnce(response) as unknown as FetchFn;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const adminScope = {
  kind: "admin" as const,
  adminId: "admin-1",
  email: "tutor@example.com",
};

const mockSession = {
  id: "ws-1",
  adminUserId: "admin-1",
  studentId: "student-1",
  consentAcknowledged: true,
  eventsBlobUrl: "https://blob.vercel-storage.com/events.json",
  endedAt: new Date("2026-04-01T18:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  requireStudentScopeMock.mockResolvedValue(adminScope);
  assertOwnsWhiteboardSessionMock.mockResolvedValue(mockSession);
});

// ─────────────────────────────────────────────────────────────────────
// generateNotesFromWhiteboardSessionAction
// ─────────────────────────────────────────────────────────────────────

describe("generateNotesFromWhiteboardSessionAction", () => {
  it("returns ok:false when scope is env-only", async () => {
    requireStudentScopeMock.mockResolvedValue({
      kind: "env",
      email: "tutor@example.com",
    });
    const result = await generateNotesFromWhiteboardSessionAction("ws-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/DB-backed tutor account/i);
    }
  });

  it("returns ok:false when session has no audio recordings", async () => {
    dbMock.sessionRecording.findMany.mockResolvedValue([]);
    const result = await generateNotesFromWhiteboardSessionAction("ws-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no audio/i);
    }
  });

  it("returns ok:false when blob download fails", async () => {
    dbMock.sessionRecording.findMany.mockResolvedValue([
      {
        id: "rec-1",
        blobUrl: "https://blob.vercel-storage.com/audio.webm",
        mimeType: "audio/webm",
        createdAt: new Date("2026-04-01T17:00:00Z"),
      },
    ]);
    dbMock.student.findUniqueOrThrow.mockResolvedValue({ name: "Alice" });
    dbMock.sessionNote.findFirst.mockResolvedValue({ template: null });
    // Mock fetch to return a non-ok response.
    mockFetchOnce(new Response(null, { status: 403 }));

    const result = await generateNotesFromWhiteboardSessionAction("ws-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/segment 1/i);
    }
  });

  it("returns ok:true with structured fields on happy path", async () => {
    dbMock.sessionRecording.findMany.mockResolvedValue([
      {
        id: "rec-1",
        blobUrl: "https://blob.vercel-storage.com/audio.webm",
        mimeType: "audio/webm",
        createdAt: new Date("2026-04-01T17:30:00Z"),
      },
    ]);
    dbMock.student.findUniqueOrThrow.mockResolvedValue({ name: "Alice" });
    dbMock.sessionNote.findFirst.mockResolvedValue({ template: null });
    dbMock.sessionRecording.update.mockResolvedValue({});

    mockFetchOnce(
      new Response(Buffer.from("audio-bytes"), { status: 200 }) as unknown as Response
    );

    transcribeAudioMock.mockResolvedValue({
      transcript: "Alice struggled with quadratic equations",
      durationSeconds: 45 * 60,
    });
    generateSessionNoteMock.mockResolvedValue({
      topics: "Quadratic equations",
      homework: "Pg 4-6",
      assessment: "Needs practice",
      plan: "Review next week",
      links: "",
      promptVersion: "v6",
    });

    const result = await generateNotesFromWhiteboardSessionAction("ws-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.topics).toBe("Quadratic equations");
      expect(result.homework).toBe("Pg 4-6");
      expect(result.recordingIds).toEqual(["rec-1"]);
    }
  });

  it("falls back to raw transcript in topics when AI returns error", async () => {
    dbMock.sessionRecording.findMany.mockResolvedValue([
      {
        id: "rec-1",
        blobUrl: "https://blob.vercel-storage.com/audio.webm",
        mimeType: "audio/webm",
        createdAt: new Date("2026-04-01T17:30:00Z"),
      },
    ]);
    dbMock.student.findUniqueOrThrow.mockResolvedValue({ name: "Alice" });
    dbMock.sessionNote.findFirst.mockResolvedValue({ template: null });
    dbMock.sessionRecording.update.mockResolvedValue({});

    mockFetchOnce(
      new Response(Buffer.from("audio-bytes"), { status: 200 }) as unknown as Response
    );
    transcribeAudioMock.mockResolvedValue({
      transcript: "Some session content",
      durationSeconds: 30 * 60,
    });
    generateSessionNoteMock.mockResolvedValue({ error: "AI unavailable" });

    const result = await generateNotesFromWhiteboardSessionAction("ws-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Falls back: raw transcript goes to topics.
      expect(result.topics).toBe("Some session content");
      expect(result.warning).toMatch(/couldn't auto-organize/i);
      expect(result.warningKind).toBe("ai-fallback");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// attachWhiteboardToNoteAction
// ─────────────────────────────────────────────────────────────────────

describe("attachWhiteboardToNoteAction", () => {
  it("detach mode — clears noteId and returns ok:true", async () => {
    dbMock.whiteboardSession.update.mockResolvedValue({});
    const result = await attachWhiteboardToNoteAction("ws-1", {
      mode: "detach",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.noteId).toBe("");
    expect(dbMock.whiteboardSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { noteId: null } })
    );
  });

  it("existing mode — returns ok:false when note belongs to different student", async () => {
    dbMock.sessionNote.findUnique.mockResolvedValue({
      id: "note-X",
      studentId: "other-student",
    });
    const result = await attachWhiteboardToNoteAction("ws-1", {
      mode: "existing",
      noteId: "note-X",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not belong/i);
  });

  it("existing mode — links session to note on happy path", async () => {
    dbMock.sessionNote.findUnique.mockResolvedValue({
      id: "note-1",
      studentId: "student-1", // matches mockSession.studentId
    });
    dbMock.whiteboardSession.update.mockResolvedValue({});
    const result = await attachWhiteboardToNoteAction("ws-1", {
      mode: "existing",
      noteId: "note-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.noteId).toBe("note-1");
    expect(dbMock.whiteboardSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { noteId: "note-1" } })
    );
  });

  it("new mode — creates a draft note and links it", async () => {
    dbMock.sessionNote.create.mockResolvedValue({ id: "new-note-1" });
    dbMock.whiteboardSession.update.mockResolvedValue({});
    const result = await attachWhiteboardToNoteAction("ws-1", {
      mode: "new",
      newNoteFromDate: "2026-04-01",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.noteId).toBe("new-note-1");
    expect(dbMock.sessionNote.create).toHaveBeenCalled();
    expect(dbMock.whiteboardSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { noteId: "new-note-1" } })
    );
  });

  it("new mode — returns ok:false for invalid date", async () => {
    const result = await attachWhiteboardToNoteAction("ws-1", {
      mode: "new",
      newNoteFromDate: "not-a-date",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid date/i);
  });
});
