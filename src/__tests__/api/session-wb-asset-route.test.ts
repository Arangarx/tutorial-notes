/**
 * @jest-environment node
 *
 * P1-J2 — GET /api/sessions/[sessionId]/wb-asset behavior/contract tests.
 *
 * Oracle: HTTP status, Content-Type / body bytes, learner-session auth gate
 * (401 unauthenticated, 404 non-participant or out-of-scope asset), and blob
 * `get` only after gates pass.
 *
 * Red-before (2026-07-05): temporarily expecting status 403 on the happy path
 * and skipping participant seed both failed before correcting oracles.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

const mockBlobGet = jest.fn();

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  get: (...args: unknown[]) => mockBlobGet(...args),
}));

const getLearnerSessionMock = jest.fn();
const getAccountHolderSessionMock = jest.fn();
const resolveAhJoinLearnerProfileIdMock = jest.fn();

jest.mock("@/lib/learner-session", () => ({
  __esModule: true,
  getLearnerSession: (...args: unknown[]) => getLearnerSessionMock(...args),
}));

jest.mock("@/lib/account-holder-session", () => ({
  __esModule: true,
  getAccountHolderSession: (...args: unknown[]) =>
    getAccountHolderSessionMock(...args),
}));

jest.mock("@/lib/join-scope", () => ({
  __esModule: true,
  resolveAhJoinLearnerProfileId: (...args: unknown[]) =>
    resolveAhJoinLearnerProfileIdMock(...args),
}));

import { db } from "@/lib/db";
import { GET } from "@/app/api/sessions/[sessionId]/wb-asset/route";
import { uniq } from "../helpers/unique-test-token";


const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

function inScopeAssetUrl(studentId: string, sessionId: string, filename = "asset.png") {
  return `https://blob.vercel-storage.com/whiteboard-sessions/${studentId}/${sessionId}/${filename}`;
}

async function seedSessionAssetFixture() {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const ah = await db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
    },
  });
  const learnerProfile = await db.learnerProfile.create({
    data: {
      accountHolderId: ah.id,
      displayName: "Participant Learner",
    },
  });
  const student = await db.student.create({
    data: {
      name: `Session Asset ${uniq()}`,
      adminUserId: tutor.id,
      learnerProfileId: learnerProfile.id,
    },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      sessionPhase: "ACTIVE",
      sessionMode: "LIVE",
      eventsBlobUrl: `https://blob.vercel-storage.com/test-${uniq()}.json`,
      consentAcknowledged: true,
    },
  });
  await db.sessionParticipant.create({
    data: {
      whiteboardSessionId: session.id,
      learnerProfileId: learnerProfile.id,
      joinedAt: new Date(),
    },
  });
  return { tutor, student, session, learnerProfile, ah };
}

function makeGetRequest(sessionId: string, assetUrl: string | null) {
  const uQuery =
    assetUrl === null ? "" : `?u=${encodeURIComponent(assetUrl)}`;
  return new Request(
    `http://localhost/api/sessions/${sessionId}/wb-asset${uQuery}`,
    { headers: { Cookie: "mynk_learner_session=fake-cookie" } }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "test_blob_rw_token";
  getAccountHolderSessionMock.mockResolvedValue(null);
  resolveAhJoinLearnerProfileIdMock.mockResolvedValue(null);
  mockBlobGet.mockResolvedValue({
    statusCode: 200,
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("png-bytes"));
        controller.close();
      },
    }),
    blob: { contentType: "image/png" },
  });
});

afterAll(async () => {
  if (originalBlobToken === undefined) {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  } else {
    process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
  }
  await db.$disconnect();
});

describe("GET /api/sessions/[sessionId]/wb-asset — learner-session asset proxy contract (P1-J2)", () => {
  it("active participant + in-scope u → 200 with image/png body", async () => {
    const { student, session, learnerProfile } = await seedSessionAssetFixture();
    getLearnerSessionMock.mockResolvedValue({
      learnerProfileId: learnerProfile.id,
    });
    const assetUrl = inScopeAssetUrl(student.id, session.id);

    const res = await GET(makeGetRequest(session.id, assetUrl), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(await res.text()).toBe("png-bytes");
    expect(mockBlobGet).toHaveBeenCalledTimes(1);
    expect(mockBlobGet).toHaveBeenCalledWith(assetUrl, { access: "private" });
  });

  it("no learner or account-holder session → 401 and does not fetch blob", async () => {
    const { student, session } = await seedSessionAssetFixture();
    getLearnerSessionMock.mockResolvedValue(null);
    getAccountHolderSessionMock.mockResolvedValue(null);
    const assetUrl = inScopeAssetUrl(student.id, session.id);

    const res = await GET(makeGetRequest(session.id, assetUrl), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(401);
    expect(await res.text()).toMatch(/unauthorized/i);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("authenticated learner who is not a participant → 404 and does not fetch blob", async () => {
    const { student, session } = await seedSessionAssetFixture();
    getLearnerSessionMock.mockResolvedValue({
      learnerProfileId: "lpr_never_joined",
    });
    const assetUrl = inScopeAssetUrl(student.id, session.id);

    const res = await GET(makeGetRequest(session.id, assetUrl), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("evil-host u with in-scope path → 404 and does not fetch blob", async () => {
    const { student, session, learnerProfile } = await seedSessionAssetFixture();
    getLearnerSessionMock.mockResolvedValue({
      learnerProfileId: learnerProfile.id,
    });
    const evilUrl = `https://evil.example/whiteboard-sessions/${student.id}/${session.id}/asset.png`;

    const res = await GET(makeGetRequest(session.id, evilUrl), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("out-of-scope u → 404 and does not fetch blob", async () => {
    const { student, session, learnerProfile } = await seedSessionAssetFixture();
    getLearnerSessionMock.mockResolvedValue({
      learnerProfileId: learnerProfile.id,
    });
    const foreignUrl = inScopeAssetUrl(student.id, "wb_other_session");

    const res = await GET(makeGetRequest(session.id, foreignUrl), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("account-holder self-learner path resolves participant → 200", async () => {
    const { student, session, ah } = await seedSessionAssetFixture();
    const selfProfile = await db.learnerProfile.create({
      data: {
        accountHolderId: ah.id,
        displayName: "Self Learner",
        isSelfLearner: true,
      },
    });
    await db.sessionParticipant.create({
      data: {
        whiteboardSessionId: session.id,
        learnerProfileId: selfProfile.id,
        joinedAt: new Date(),
      },
    });

    getLearnerSessionMock.mockResolvedValue(null);
    getAccountHolderSessionMock.mockResolvedValue({
      accountHolderId: ah.id,
    });
    resolveAhJoinLearnerProfileIdMock.mockResolvedValue({
      learnerProfileId: selfProfile.id,
    });

    const assetUrl = inScopeAssetUrl(student.id, session.id);
    const res = await GET(makeGetRequest(session.id, assetUrl), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("png-bytes");
    expect(mockBlobGet).toHaveBeenCalledTimes(1);
  });

  it("ended session → 410 and does not fetch blob", async () => {
    const { student, session, learnerProfile } = await seedSessionAssetFixture();
    getLearnerSessionMock.mockResolvedValue({
      learnerProfileId: learnerProfile.id,
    });
    await db.whiteboardSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });
    const assetUrl = inScopeAssetUrl(student.id, session.id);

    const res = await GET(makeGetRequest(session.id, assetUrl), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(410);
    expect(await res.text()).toMatch(/session ended/i);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });
});
