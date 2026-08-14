/**
 * @jest-environment node
 */

/**
 * Unit coverage for `createWhiteboardSession`.
 *
 * CC-1 gates session create on ConsentRecord existence (claimed minors).
 * Self-learners (D-5) and unclaimed rejection are covered here; snapshot
 * freeze logic is in consent-b2.test.ts / consent-cc1.test.ts.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  redirect: jest.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT to ${url}`);
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(),
}));

const dbCreateMock = jest.fn();
const dbStudentFindUniqueMock = jest.fn();
const dbErasureJobFindFirstMock = jest.fn();
const dbConsentRecordFindFirstMock = jest.fn();
const dbLearnerProfileFindUniqueMock = jest.fn();
const dbSessionParticipantCreateManyMock = jest.fn();
const dbSessionConsentSnapshotCreateMock = jest.fn();
const dbTransactionMock = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    whiteboardSession: { create: (...args: unknown[]) => dbCreateMock(...args) },
    consentRecord: { findFirst: (...args: unknown[]) => dbConsentRecordFindFirstMock(...args) },
    consentRestriction: { findUnique: jest.fn().mockResolvedValue(null) },
    sessionConsentSnapshot: {
      create: (...args: unknown[]) => dbSessionConsentSnapshotCreateMock(...args),
    },
    sessionParticipant: {
      createMany: (...args: unknown[]) => dbSessionParticipantCreateManyMock(...args),
    },
  };
  return fn(tx);
});
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    adminUser: { findUnique: jest.fn().mockResolvedValue({ approvalStatus: "APPROVED" }) },
    student: {
      findUnique: (...args: unknown[]) => dbStudentFindUniqueMock(...args),
    },
    consentRecord: {
      findFirst: (...args: unknown[]) => dbConsentRecordFindFirstMock(...args),
    },
    learnerProfile: {
      findUnique: (...args: unknown[]) => dbLearnerProfileFindUniqueMock(...args),
    },
    erasureJob: {
      findFirst: (...args: unknown[]) => dbErasureJobFindFirstMock(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => dbTransactionMock(fn),
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const mockLogProductEvent = jest.fn();

jest.mock("@/lib/observability/product-events", () => ({
  __esModule: true,
  logProductEvent: (...args: unknown[]) => mockLogProductEvent(...args),
}));

const requireStudentScopeMock = jest.fn();
const assertOwnsStudentMock = jest.fn(async (..._args: unknown[]) => {});
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: () => requireStudentScopeMock(),
  assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
}));

jest.mock("@/lib/consent-scope", () => {
  const actual = jest.requireActual<typeof import("@/lib/consent-scope")>(
    "@/lib/consent-scope"
  );
  return {
    ...actual,
    assertEffectiveConsent: jest.fn().mockResolvedValue(undefined),
  };
});

import { createWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { put } from "@vercel/blob";
import { redirect } from "next/navigation";
import { ConsentError } from "@/lib/consent-scope";

const putMock = put as jest.MockedFunction<typeof put>;
const redirectMock = redirect as jest.MockedFunction<typeof redirect>;

const defaultAdminScope = {
  kind: "admin" as const,
  adminId: "admin-1",
  email: "tutor@example.com",
};

const defaultBlobResult = {
  url: "https://blob.example.com/whiteboard-sessions/admin-1/student-1/123-events.json",
  pathname: "x",
  contentType: "application/json",
  contentDisposition: "",
  downloadUrl: "x",
} as Awaited<ReturnType<typeof put>>;

/** Erasure guard happy path — no tombstone, no active job. */
const erasureClearStudent = {
  erasedAt: null,
  learnerProfileId: "lp-1",
  learnerProfile: {
    tombstonedAt: null,
    accountHolderId: null,
    accountHolder: { tombstonedAt: null },
  },
};

/** Claimed minor with a consent record — default happy path after CC-1. */
function mockClaimedWithRecord() {
  dbStudentFindUniqueMock.mockResolvedValue(erasureClearStudent);
  dbConsentRecordFindFirstMock.mockResolvedValue({
    id: "cr-1",
    version: 1,
    allowLiveSession: true,
    allowAudioRecording: true,
    allowWhiteboardRecording: true,
    allowNoteSending: true,
    learnerProfile: { isSelfLearner: false },
  });
}

beforeEach(() => {
  putMock.mockReset();
  dbCreateMock.mockReset();
  dbTransactionMock.mockClear();
  dbStudentFindUniqueMock.mockReset();
  dbErasureJobFindFirstMock.mockReset();
  dbErasureJobFindFirstMock.mockResolvedValue(null);
  dbConsentRecordFindFirstMock.mockReset();
  dbLearnerProfileFindUniqueMock.mockReset();
  dbSessionParticipantCreateManyMock.mockReset();
  dbSessionConsentSnapshotCreateMock.mockReset();
  dbSessionParticipantCreateManyMock.mockResolvedValue({ count: 0 });
  dbSessionConsentSnapshotCreateMock.mockResolvedValue({});
  requireStudentScopeMock.mockReset();
  assertOwnsStudentMock.mockClear();
  redirectMock.mockClear();
  mockLogProductEvent.mockReset();

  mockClaimedWithRecord();
});

describe("createWhiteboardSession — CC-1 consent record gate", () => {
  test("creates session when claimed minor has a ConsentRecord", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    putMock.mockResolvedValue(defaultBlobResult);
    dbCreateMock.mockResolvedValue({ id: "wb-session-xyz", studentId: "student-1" });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(dbCreateMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/students/student-1/whiteboard/wb-session-xyz/workspace"
    );
    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "SESSION_CREATED",
      adminUserId: "admin-1",
      studentId: "student-1",
      whiteboardSessionId: "wb-session-xyz",
      metadata: { claimed: true },
    });
  });

  test("T-new-A / T1: claimed minor + no ConsentRecord → ConsentError, no Blob, no row", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    dbConsentRecordFindFirstMock.mockResolvedValue(null);
    dbLearnerProfileFindUniqueMock.mockResolvedValue({ isSelfLearner: false });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(ConsentError);
    expect(putMock).not.toHaveBeenCalled();
    expect(dbCreateMock).not.toHaveBeenCalled();
  });

  test("T2: unclaimed student → ConsentError, no Blob, no row", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    dbStudentFindUniqueMock.mockResolvedValue({
      erasedAt: null,
      learnerProfileId: null,
      learnerProfile: null,
    });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(ConsentError);
    expect(putMock).not.toHaveBeenCalled();
    expect(dbCreateMock).not.toHaveBeenCalled();
  });

  test("T3: all-off ConsentRecord → session CREATED, snapshot allowLiveSession=false", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    dbConsentRecordFindFirstMock.mockImplementation(async (args: { where?: unknown }) => {
      const isTx = !args || typeof args !== "object" || !("where" in args);
      return {
        id: "cr-all-off",
        version: 1,
        allowLiveSession: false,
        allowAudioRecording: false,
        allowWhiteboardRecording: false,
        allowNoteSending: false,
        learnerProfile: { isSelfLearner: false },
      };
    });
    putMock.mockResolvedValue(defaultBlobResult);
    dbCreateMock.mockResolvedValue({ id: "wb-all-off", studentId: "student-1" });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(dbCreateMock).toHaveBeenCalledTimes(1);
    expect(dbSessionConsentSnapshotCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        allowLiveSession: false,
        consentRecordId: "cr-all-off",
      }),
    });
  });

  test("T9: self-learner without ConsentRecord → passes", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    dbConsentRecordFindFirstMock.mockResolvedValue(null);
    dbLearnerProfileFindUniqueMock.mockResolvedValue({ isSelfLearner: true });
    putMock.mockResolvedValue(defaultBlobResult);
    dbCreateMock.mockResolvedValue({ id: "wb-self", studentId: "student-1" });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(dbCreateMock).toHaveBeenCalledTimes(1);
  });

  test("rejects an env-only admin (no AdminUser row)", async () => {
    requireStudentScopeMock.mockResolvedValue({
      kind: "env",
      email: "env-admin@example.com",
    });
    await expect(createWhiteboardSession("student-1")).rejects.toThrow(
      /registered admin account/i
    );
    expect(putMock).not.toHaveBeenCalled();
    expect(dbCreateMock).not.toHaveBeenCalled();
  });

  test("claimed student: creates SessionParticipant row in the same transaction", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    putMock.mockResolvedValue({ ...defaultBlobResult, url: "https://blob.example.com/x.json" });
    dbCreateMock.mockResolvedValue({ id: "wb-claimed", studentId: "student-1" });

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(/NEXT_REDIRECT/);

    expect(dbSessionParticipantCreateManyMock).toHaveBeenCalledWith({
      data: [{ whiteboardSessionId: "wb-claimed", learnerProfileId: "lp-1" }],
      skipDuplicates: true,
    });
  });

  test("does not insert a row if Blob put fails", async () => {
    requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
    putMock.mockRejectedValue(new Error("blob storage 500"));

    await expect(createWhiteboardSession("student-1")).rejects.toThrow(
      /whiteboard session storage/i
    );
    expect(dbCreateMock).not.toHaveBeenCalled();
  });
});
