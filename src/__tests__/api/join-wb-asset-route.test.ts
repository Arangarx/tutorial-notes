/**
 * @jest-environment node
 *
 * P1-J2 — GET /api/w/[joinToken]/wb-asset behavior/contract tests.
 *
 * Oracle: HTTP status, response Content-Type / body bytes, and that blob `get`
 * is only invoked after join-token + in-scope URL gates pass.
 *
 * Red-before (2026-07-05): temporarily expecting status 403 on the happy path
 * and omitting Content-Type both failed before correcting oracles.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

const mockBlobGet = jest.fn();

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  get: (...args: unknown[]) => mockBlobGet(...args),
}));

import { db } from "@/lib/db";
import { GET } from "@/app/api/w/[joinToken]/wb-asset/route";
import { uniq } from "../helpers/unique-test-token";


const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

function inScopeAssetUrl(studentId: string, sessionId: string, filename = "asset.png") {
  return `https://blob.vercel-storage.com/whiteboard-sessions/${studentId}/${sessionId}/${filename}`;
}

async function seedJoinAssetFixture() {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const student = await db.student.create({
    data: { name: `Join Asset ${uniq()}`, adminUserId: tutor.id },
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
  const joinToken = uniq("join");
  await db.whiteboardJoinToken.create({
    data: {
      whiteboardSessionId: session.id,
      token: joinToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { tutor, student, session, joinToken };
}

function makeGetRequest(joinToken: string, assetUrl: string | null) {
  const uQuery =
    assetUrl === null ? "" : `?u=${encodeURIComponent(assetUrl)}`;
  return new Request(`http://localhost/api/w/${joinToken}/wb-asset${uQuery}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "test_blob_rw_token";
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

describe("GET /api/w/[joinToken]/wb-asset — join-token asset proxy contract (P1-J2)", () => {
  it("valid join token + in-scope u → 200 with image/png body and streams blob", async () => {
    const { student, session, joinToken } = await seedJoinAssetFixture();
    const assetUrl = inScopeAssetUrl(student.id, session.id);

    const res = await GET(makeGetRequest(joinToken, assetUrl), {
      params: Promise.resolve({ joinToken }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(await res.text()).toBe("png-bytes");
    expect(mockBlobGet).toHaveBeenCalledTimes(1);
    expect(mockBlobGet).toHaveBeenCalledWith(assetUrl, { access: "private" });
  });

  it("revoked join token → 404 and does not fetch blob", async () => {
    const { student, session, joinToken } = await seedJoinAssetFixture();
    await db.whiteboardJoinToken.update({
      where: { token: joinToken },
      data: { revokedAt: new Date() },
    });
    const assetUrl = inScopeAssetUrl(student.id, session.id);

    const res = await GET(makeGetRequest(joinToken, assetUrl), {
      params: Promise.resolve({ joinToken }),
    });

    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/not found/i);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("unknown join token → 404 and does not fetch blob", async () => {
    const res = await GET(
      makeGetRequest(
        "tok_unknown_opaque",
        inScopeAssetUrl("stu_fake", "wb_fake")
      ),
      { params: Promise.resolve({ joinToken: "tok_unknown_opaque" }) }
    );

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("evil-host u with in-scope path → 404 and does not fetch blob", async () => {
    const { student, session, joinToken } = await seedJoinAssetFixture();
    const evilUrl = `https://evil.example/whiteboard-sessions/${student.id}/${session.id}/asset.png`;

    const res = await GET(makeGetRequest(joinToken, evilUrl), {
      params: Promise.resolve({ joinToken }),
    });

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("out-of-scope u (different session namespace) → 404 and does not fetch blob", async () => {
    const { student, session, joinToken } = await seedJoinAssetFixture();
    const foreignUrl = inScopeAssetUrl(student.id, "wb_other_session");

    const res = await GET(makeGetRequest(joinToken, foreignUrl), {
      params: Promise.resolve({ joinToken }),
    });

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("missing u query param → 400 and does not fetch blob", async () => {
    const { joinToken } = await seedJoinAssetFixture();

    const res = await GET(makeGetRequest(joinToken, null), {
      params: Promise.resolve({ joinToken }),
    });

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/missing u/i);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("ended session → 410 and does not fetch blob", async () => {
    const { student, session, joinToken } = await seedJoinAssetFixture();
    await db.whiteboardSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });
    const assetUrl = inScopeAssetUrl(student.id, session.id);

    const res = await GET(makeGetRequest(joinToken, assetUrl), {
      params: Promise.resolve({ joinToken }),
    });

    expect(res.status).toBe(410);
    expect(await res.text()).toMatch(/session ended/i);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });
});
