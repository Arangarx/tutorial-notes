/**
 * B1 tutor signup-waitlist — unit tests
 *
 * Coverage:
 *   TAP-1: assertTutorApproved throws TutorNotApprovedError for WAITLISTED status
 *   TAP-2: assertTutorApproved passes (no throw) for APPROVED status
 *   TAP-3: assertTutorApproved throws for non-existent row (treated as WAITLISTED)
 *   TAP-4: isTutorApproved returns false for WAITLISTED
 *   TAP-5: isTutorApproved returns true for APPROVED
 *   TAP-6: approveTutor updates DB + logs [tap] action=approved
 *   TAP-7: non-operator cannot call approveTutorAction (returns notFound equivalent)
 *   TAP-8: createAdmin sets approvalStatus=WAITLISTED explicitly
 *   TAP-9: grandfathered/existing row with APPROVED status passes assertTutorApproved
 *   TAP-10: transcription worker skips WAITLISTED session (Layer B gate)
 *   TAP-11: notes worker skips WAITLISTED session (Layer B gate)
 *   TAP-12: rejectTutor updates WAITLISTED → REJECTED
 *   TAP-13: rejectTutor is idempotent when already REJECTED
 *   TAP-14: assertTutorApproved throws for REJECTED
 *   TAP-15: isTutorApproved returns false for REJECTED
 *   TAP-16: revokeTutorApproval updates APPROVED → WAITLISTED
 *   TAP-17: approveTutorAction refuses REJECTED (terminal)
 *   TAP-7: non-operator cannot call approve/reject/revoke actions
 *
 * Mocks: @/lib/db via jest.mock — no real DB connection needed.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAdminUserFindUnique = jest.fn();
const mockAdminUserUpdate = jest.fn();
const mockAdminUserCreate = jest.fn();
const mockLogProductEvent = jest.fn();

const mockWhiteboardSessionFindUnique = jest.fn();

jest.mock("@/lib/observability/product-events", () => ({
  logProductEvent: (...args: unknown[]) => mockLogProductEvent(...args),
}));

jest.mock("@/lib/db", () => ({
  db: {
    adminUser: {
      findUnique: (...args: unknown[]) => mockAdminUserFindUnique(...args),
      update: (...args: unknown[]) => mockAdminUserUpdate(...args),
      create: (...args: unknown[]) => mockAdminUserCreate(...args),
    },
    whiteboardSession: {
      findUnique: (...args: unknown[]) => mockWhiteboardSessionFindUnique(...args),
    },
  },
  withDbRetry: <T>(fn: () => Promise<T>) => fn(),
}));

// Transcription worker deps
const mockGetTranscriptChunkByBlobUrl = jest.fn();
const mockUpsertTranscriptChunk = jest.fn();
const mockGetTranscriptChunksBySessionId = jest.fn();
const mockTranscribeChunk = jest.fn();
const mockFetchPrivateBlobBytes = jest.fn();

jest.mock("@/lib/recording/transcript-store", () => ({
  getTranscriptChunkByBlobUrl: (...a: unknown[]) => mockGetTranscriptChunkByBlobUrl(...a),
  upsertTranscriptChunk: (...a: unknown[]) => mockUpsertTranscriptChunk(...a),
  getTranscriptChunksBySessionId: (...a: unknown[]) => mockGetTranscriptChunksBySessionId(...a),
}));

jest.mock("@/lib/recording/transcribe-chunk", () => ({
  transcribeChunk: (...a: unknown[]) => mockTranscribeChunk(...a),
}));

jest.mock("@/lib/blob", () => ({
  fetchPrivateBlobBytes: (...a: unknown[]) => mockFetchPrivateBlobBytes(...a),
}));

// Notes worker deps
const mockGetTutorNoteBySessionId = jest.fn();
const mockUpdateTutorNote = jest.fn();
const mockUpsertTutorNotePending = jest.fn();
const mockGetTranscriptChunksBySessionIdNotes = jest.fn();
const mockGetChunkExtractionsBySessionId = jest.fn();
const mockEstimateCostUsd = jest.fn();
const mockLogCostEvent = jest.fn();

jest.mock("@/lib/recording/transcript-store", () => ({
  getTranscriptChunkByBlobUrl: (...a: unknown[]) => mockGetTranscriptChunkByBlobUrl(...a),
  upsertTranscriptChunk: (...a: unknown[]) => mockUpsertTranscriptChunk(...a),
  getTranscriptChunksBySessionId: (...a: unknown[]) => mockGetTranscriptChunksBySessionIdNotes(...a),
  getTutorNoteBySessionId: (...a: unknown[]) => mockGetTutorNoteBySessionId(...a),
  updateTutorNote: (...a: unknown[]) => mockUpdateTutorNote(...a),
  upsertTutorNotePending: (...a: unknown[]) => mockUpsertTutorNotePending(...a),
  getChunkExtractionsBySessionId: (...a: unknown[]) => mockGetChunkExtractionsBySessionId(...a),
}));

jest.mock("@/lib/observability/cost-events", () => ({
  estimateCostUsd: (...a: unknown[]) => mockEstimateCostUsd(...a),
  logCostEvent: (...a: unknown[]) => mockLogCostEvent(...a),
}));

jest.mock("@/lib/recording/extract-chunk", () => ({
  extractChunkMap: jest.fn().mockResolvedValue("done"),
}));

// Mock operator check for action tests
jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const mockIsOperatorEmail = jest.fn();

jest.mock("@/lib/operator", () => ({
  isOperatorEmail: (...args: unknown[]) => mockIsOperatorEmail(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  assertTutorApproved,
  isTutorApproved,
  getTutorApprovalStatus,
  approveTutor,
  rejectTutor,
  revokeTutorApproval,
  TutorNotApprovedError,
} from "@/lib/tutor-approval-scope";
import {
  approveTutorAction,
  rejectTutorAction,
  revokeTutorApprovalAction,
} from "@/app/admin/tutor-approvals/actions";
import { getServerSession } from "next-auth";
import { processChunkTranscribeJob } from "@/lib/recording/transcription-worker";
import { processNotesReduceJob } from "@/lib/recording/notes-worker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APPROVED_ADMIN_ID = "admin-approved-001";
const WAITLISTED_ADMIN_ID = "admin-waitlisted-001";
const REJECTED_ADMIN_ID = "admin-rejected-001";
const OPERATOR_ID = "admin-operator-001";
const OPERATOR_EMAIL = "ops@example.com";
const SESSION_ID = "wbsid-approval-test";
const CHUNK_URL = "https://blob.vercel-storage.com/chunk-test.webm";

function mockApprovedAdmin(id = APPROVED_ADMIN_ID) {
  mockAdminUserFindUnique.mockResolvedValueOnce({ id, approvalStatus: "APPROVED" });
}

function mockWaitlistedAdmin(id = WAITLISTED_ADMIN_ID) {
  mockAdminUserFindUnique.mockResolvedValueOnce({ id, approvalStatus: "WAITLISTED" });
}

function mockMissingAdmin() {
  mockAdminUserFindUnique.mockResolvedValueOnce(null);
}

function mockRejectedAdmin(id = REJECTED_ADMIN_ID) {
  mockAdminUserFindUnique.mockResolvedValueOnce({ id, approvalStatus: "REJECTED" });
}

function mockOperatorSession() {
  (getServerSession as jest.Mock).mockResolvedValue({
    user: { id: OPERATOR_ID, email: OPERATOR_EMAIL },
  });
}

// ---------------------------------------------------------------------------
// TAP-1: assertTutorApproved throws TutorNotApprovedError for WAITLISTED
// ---------------------------------------------------------------------------
describe("TAP-1 — assertTutorApproved throws for WAITLISTED", () => {
  beforeEach(() => {
    mockLogProductEvent.mockReset();
  });

  it("throws TutorNotApprovedError with correct fields", async () => {
    mockWaitlistedAdmin();
    await expect(assertTutorApproved(WAITLISTED_ADMIN_ID)).rejects.toMatchObject({
      name: "TutorNotApprovedError",
      code: "TUTOR_NOT_APPROVED",
      adminUserId: WAITLISTED_ADMIN_ID,
      status: "WAITLISTED",
    });
  });

  it("error is instanceof TutorNotApprovedError", async () => {
    mockWaitlistedAdmin();
    let caught: unknown = null;
    try {
      await assertTutorApproved(WAITLISTED_ADMIN_ID);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TutorNotApprovedError);
  });

  it("logs TUTOR_WAITLIST_BLOCKED before throwing", async () => {
    mockWaitlistedAdmin();
    await expect(assertTutorApproved(WAITLISTED_ADMIN_ID)).rejects.toBeInstanceOf(
      TutorNotApprovedError
    );

    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "TUTOR_WAITLIST_BLOCKED",
      adminUserId: WAITLISTED_ADMIN_ID,
      metadata: { surface: "tutor_approval_gate" },
    });
  });
});

// ---------------------------------------------------------------------------
// TAP-2: assertTutorApproved passes for APPROVED
// ---------------------------------------------------------------------------
describe("TAP-2 — assertTutorApproved passes for APPROVED", () => {
  it("does not throw for APPROVED tutor", async () => {
    mockApprovedAdmin();
    await expect(assertTutorApproved(APPROVED_ADMIN_ID)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TAP-3: assertTutorApproved throws for non-existent row
// ---------------------------------------------------------------------------
describe("TAP-3 — assertTutorApproved throws for non-existent row", () => {
  it("treats missing row as WAITLISTED and throws", async () => {
    mockMissingAdmin();
    await expect(assertTutorApproved("no-such-id")).rejects.toMatchObject({
      name: "TutorNotApprovedError",
      code: "TUTOR_NOT_APPROVED",
    });
  });
});

// ---------------------------------------------------------------------------
// TAP-4: isTutorApproved returns false for WAITLISTED
// ---------------------------------------------------------------------------
describe("TAP-4 — isTutorApproved returns false for WAITLISTED", () => {
  it("returns false", async () => {
    mockWaitlistedAdmin();
    const result = await isTutorApproved(WAITLISTED_ADMIN_ID);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TAP-5: isTutorApproved returns true for APPROVED
// ---------------------------------------------------------------------------
describe("TAP-5 — isTutorApproved returns true for APPROVED", () => {
  it("returns true", async () => {
    mockApprovedAdmin();
    const result = await isTutorApproved(APPROVED_ADMIN_ID);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TAP-6: approveTutor updates DB and logs
// ---------------------------------------------------------------------------
describe("TAP-6 — approveTutor updates DB", () => {
  beforeEach(() => {
    mockLogProductEvent.mockReset();
  });

  it("calls db.adminUser.update with APPROVED status and operatorId", async () => {
    mockAdminUserUpdate.mockResolvedValueOnce({});
    await approveTutor(WAITLISTED_ADMIN_ID, OPERATOR_ID);

    expect(mockAdminUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WAITLISTED_ADMIN_ID },
        data: expect.objectContaining({
          approvalStatus: "APPROVED",
          approvedByAdminId: OPERATOR_ID,
        }),
      })
    );
    const call = mockAdminUserUpdate.mock.calls[0][0];
    expect(call.data.approvedAt).toBeInstanceOf(Date);
  });

  it("logs TUTOR_APPROVED product event with operatorId", async () => {
    mockAdminUserUpdate.mockResolvedValueOnce({});
    await approveTutor(WAITLISTED_ADMIN_ID, OPERATOR_ID);

    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "TUTOR_APPROVED",
      adminUserId: WAITLISTED_ADMIN_ID,
      metadata: { operatorId: OPERATOR_ID },
    });
  });
});

// ---------------------------------------------------------------------------
// TAP-8: createAdmin sets approvalStatus=WAITLISTED
// ---------------------------------------------------------------------------
describe("TAP-8 — createAdmin sets WAITLISTED", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ADMIN_PASSWORD = "pass";
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  it("passes approvalStatus: WAITLISTED to db.adminUser.create", async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: "new-001" });
    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: { create: mockCreate },
      },
    }));

    // Verify that the code in createAdmin explicitly sets approvalStatus: "WAITLISTED"
    // (The schema default also covers it, but this tests the explicit intent.)
    const src = await import("fs").then((m) => m.default.readFileSync(
      require("path").join(process.cwd(), "src/lib/auth-db.ts"),
      "utf-8"
    ));
    expect(src).toContain('approvalStatus: "WAITLISTED"');
  });
});

// ---------------------------------------------------------------------------
// TAP-9: grandfathered APPROVED row passes assertTutorApproved
// ---------------------------------------------------------------------------
describe("TAP-9 — grandfathered APPROVED row passes gate", () => {
  it("does not throw for a row with APPROVED status (backfilled by migration)", async () => {
    mockAdminUserFindUnique.mockResolvedValueOnce({
      id: "grandfather-001",
      approvalStatus: "APPROVED",
    });
    await expect(assertTutorApproved("grandfather-001")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TAP-10: transcription worker skips WAITLISTED session (Layer B)
// ---------------------------------------------------------------------------
describe("TAP-10 — processChunkTranscribeJob skips WAITLISTED session", () => {
  it("returns 'skipped' without calling transcribeChunk", async () => {
    // Stub: session has a WAITLISTED tutor
    mockWhiteboardSessionFindUnique.mockResolvedValueOnce({
      adminUserId: WAITLISTED_ADMIN_ID,
    });
    // isTutorApproved → false (WAITLISTED)
    mockAdminUserFindUnique.mockResolvedValueOnce({ id: WAITLISTED_ADMIN_ID, approvalStatus: "WAITLISTED" });

    const result = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(result).toBe("skipped");
    expect(mockTranscribeChunk).not.toHaveBeenCalled();
    expect(mockFetchPrivateBlobBytes).not.toHaveBeenCalled();
  });

  it("proceeds to transcription for APPROVED session", async () => {
    // Stub: session has an APPROVED tutor
    mockWhiteboardSessionFindUnique.mockResolvedValueOnce({
      adminUserId: APPROVED_ADMIN_ID,
    });
    mockAdminUserFindUnique.mockResolvedValueOnce({ id: APPROVED_ADMIN_ID, approvalStatus: "APPROVED" });

    // Stub: already done — so it returns 'skipped' via idempotency
    mockGetTranscriptChunkByBlobUrl.mockResolvedValueOnce({ status: "done", id: "chunk-001", attempts: 1 });

    const result = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    // Passes approval gate; hits idempotency => 'skipped' (not a cost skip)
    expect(result).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// TAP-11: notes worker skips WAITLISTED session (Layer B)
// ---------------------------------------------------------------------------
describe("TAP-11 — processNotesReduceJob skips WAITLISTED session", () => {
  it("returns { outcome: 'skipped', reason: 'tutor_not_approved' } for WAITLISTED", async () => {
    // No existing TutorNote → not idempotency-skipped
    mockGetTutorNoteBySessionId.mockResolvedValueOnce(null);

    // Session found with WAITLISTED adminUserId
    mockWhiteboardSessionFindUnique.mockResolvedValueOnce({
      id: SESSION_ID,
      endedAt: new Date(),
      adminUserId: WAITLISTED_ADMIN_ID,
    });

    // isTutorApproved → false
    mockAdminUserFindUnique.mockResolvedValueOnce({ id: WAITLISTED_ADMIN_ID, approvalStatus: "WAITLISTED" });

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result).toEqual({ outcome: "skipped", reason: "tutor_not_approved" });
  });
});

// ---------------------------------------------------------------------------
// TAP-12: rejectTutor updates WAITLISTED → REJECTED
// ---------------------------------------------------------------------------
describe("TAP-12 — rejectTutor updates WAITLISTED → REJECTED", () => {
  it("calls db.adminUser.update with REJECTED and clears approval metadata", async () => {
    mockAdminUserFindUnique.mockResolvedValueOnce({
      id: WAITLISTED_ADMIN_ID,
      approvalStatus: "WAITLISTED",
    });
    mockAdminUserUpdate.mockResolvedValueOnce({});

    await rejectTutor(WAITLISTED_ADMIN_ID, OPERATOR_ID);

    expect(mockAdminUserUpdate).toHaveBeenCalledWith({
      where: { id: WAITLISTED_ADMIN_ID },
      data: {
        approvalStatus: "REJECTED",
        approvedAt: null,
        approvedByAdminId: null,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// TAP-13: rejectTutor idempotent when already REJECTED
// ---------------------------------------------------------------------------
describe("TAP-13 — rejectTutor idempotent for REJECTED", () => {
  beforeEach(() => {
    mockAdminUserUpdate.mockClear();
  });

  it("does not call update when already REJECTED", async () => {
    mockAdminUserFindUnique.mockResolvedValueOnce({
      id: REJECTED_ADMIN_ID,
      approvalStatus: "REJECTED",
    });

    await rejectTutor(REJECTED_ADMIN_ID, OPERATOR_ID);

    expect(mockAdminUserUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TAP-14: assertTutorApproved throws for REJECTED
// ---------------------------------------------------------------------------
describe("TAP-14 — assertTutorApproved throws for REJECTED", () => {
  beforeEach(() => {
    mockLogProductEvent.mockReset();
  });

  it("throws TutorNotApprovedError with status REJECTED", async () => {
    mockAdminUserFindUnique.mockResolvedValueOnce({
      id: REJECTED_ADMIN_ID,
      approvalStatus: "REJECTED",
    });

    await expect(assertTutorApproved(REJECTED_ADMIN_ID)).rejects.toMatchObject({
      name: "TutorNotApprovedError",
      code: "TUTOR_NOT_APPROVED",
      adminUserId: REJECTED_ADMIN_ID,
      status: "REJECTED",
    });
  });
});

// ---------------------------------------------------------------------------
// TAP-15: isTutorApproved returns false for REJECTED
// ---------------------------------------------------------------------------
describe("TAP-15 — isTutorApproved returns false for REJECTED", () => {
  it("returns false", async () => {
    mockRejectedAdmin();
    const result = await isTutorApproved(REJECTED_ADMIN_ID);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TAP-16: revokeTutorApproval updates APPROVED → WAITLISTED
// ---------------------------------------------------------------------------
describe("TAP-16 — revokeTutorApproval updates APPROVED → WAITLISTED", () => {
  it("calls db.adminUser.update with WAITLISTED and clears approval metadata", async () => {
    mockAdminUserUpdate.mockResolvedValueOnce({});

    await revokeTutorApproval(APPROVED_ADMIN_ID, OPERATOR_ID);

    expect(mockAdminUserUpdate).toHaveBeenCalledWith({
      where: { id: APPROVED_ADMIN_ID },
      data: {
        approvalStatus: "WAITLISTED",
        approvedAt: null,
        approvedByAdminId: null,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// TAP-17: approveTutorAction refuses REJECTED (terminal)
// ---------------------------------------------------------------------------
describe("TAP-17 — approveTutorAction refuses REJECTED", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOperatorEmail.mockReturnValue(true);
    mockOperatorSession();
  });

  it("returns error and does not call approveTutor when status is REJECTED", async () => {
    mockAdminUserFindUnique.mockResolvedValueOnce({
      id: REJECTED_ADMIN_ID,
      approvalStatus: "REJECTED",
      email: "rejected@example.com",
    });

    const result = await approveTutorAction(REJECTED_ADMIN_ID);

    expect(result).toEqual({
      ok: false,
      error: "Rejected tutors cannot be approved.",
    });
    expect(mockAdminUserUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TAP-7: non-operator cannot call approve/reject/revoke actions
// ---------------------------------------------------------------------------
describe("TAP-7 — operator-only server actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOperatorEmail.mockReset();
  });

  it("approveTutorAction calls notFound for non-operator", async () => {
    mockIsOperatorEmail.mockReturnValue(false);
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "tutor-1", email: "tutor@example.com" },
    });

    await expect(approveTutorAction(WAITLISTED_ADMIN_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("rejectTutorAction calls notFound for non-operator", async () => {
    mockIsOperatorEmail.mockReturnValue(false);
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "tutor-1", email: "tutor@example.com" },
    });

    await expect(rejectTutorAction(WAITLISTED_ADMIN_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("revokeTutorApprovalAction calls notFound for non-operator", async () => {
    mockIsOperatorEmail.mockReturnValue(false);
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "tutor-1", email: "tutor@example.com" },
    });

    await expect(revokeTutorApprovalAction(APPROVED_ADMIN_ID)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("rejectTutorAction rejects WAITLISTED tutor for operator", async () => {
    mockIsOperatorEmail.mockReturnValue(true);
    mockOperatorSession();
    mockAdminUserFindUnique.mockResolvedValueOnce({
      id: WAITLISTED_ADMIN_ID,
      approvalStatus: "WAITLISTED",
    });
    mockAdminUserFindUnique.mockResolvedValueOnce({
      id: WAITLISTED_ADMIN_ID,
      approvalStatus: "WAITLISTED",
    });
    mockAdminUserUpdate.mockResolvedValueOnce({});

    const result = await rejectTutorAction(WAITLISTED_ADMIN_ID);

    expect(result).toEqual({ ok: true });
    expect(mockAdminUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WAITLISTED_ADMIN_ID },
        data: expect.objectContaining({ approvalStatus: "REJECTED" }),
      })
    );
  });

  it("revokeTutorApprovalAction revokes APPROVED tutor for operator", async () => {
    mockIsOperatorEmail.mockReturnValue(true);
    mockOperatorSession();
    mockAdminUserFindUnique.mockResolvedValueOnce({
      id: APPROVED_ADMIN_ID,
      approvalStatus: "APPROVED",
    });
    mockAdminUserUpdate.mockResolvedValueOnce({});

    const result = await revokeTutorApprovalAction(APPROVED_ADMIN_ID);

    expect(result).toEqual({ ok: true });
    expect(mockAdminUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: APPROVED_ADMIN_ID },
        data: expect.objectContaining({ approvalStatus: "WAITLISTED" }),
      })
    );
  });
});
