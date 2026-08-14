/**
 * @jest-environment node
 *
 * SMOKE-PRIV-1 — learner logout must not leave parent AH session on shared device.
 *
 * Oracle: Set-Cookie headers clear both cookies; DB rows have revokedAt.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  createAccountHolderSession,
  AH_SESSION_COOKIE,
  clearAhSessionCookie,
} from "@/lib/account-holder-session";
import {
  createLearnerSession,
  LEARNER_SESSION_COOKIE,
  clearLearnerSessionCookie,
} from "@/lib/learner-session";
import { hashAccountHolderPassword } from "@/lib/account-holder-auth";
import { POST } from "@/app/api/auth/learner/logout/route";

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";
const TEST_HMAC_SECRET_LEARNER = "test-learner-session-secret-minimum-32-bytes";

beforeAll(() => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
  process.env.LEARNER_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_LEARNER;
});

afterAll(async () => {
  await db.$disconnect();
});

async function createTestAccountHolder() {
  const email = `priv1-ah-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashAccountHolderPassword("password123");
  return db.accountHolder.create({
    data: {
      email,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
}

async function createTestLearnerProfile(accountHolderId: string) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Priv1 Test Learner",
      accessMode: "child_pin_required",
    },
  });
}

function buildLogoutRequest(cookies: Record<string, string>): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest("http://localhost/api/auth/learner/logout", {
    method: "POST",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

function collectSetCookieHeaders(res: Response): string[] {
  const single = res.headers.get("set-cookie");
  if (!single) return [];
  // Node fetch may concatenate multiple Set-Cookie with comma — split on cookie names.
  const parts = single.split(/,(?=\s*mynk_)/);
  return parts.map((p) => p.trim());
}

describe("POST /api/auth/learner/logout — SMOKE-PRIV-1", () => {
  it("dual-cookie: revokes both sessions and clears both Set-Cookie headers", async () => {
    const ah = await createTestAccountHolder();
    const profile = await createTestLearnerProfile(ah.id);

    const ahSession = await createAccountHolderSession(ah.id);
    const learnerSession = await createLearnerSession(profile.id);

    const req = buildLogoutRequest({
      [AH_SESSION_COOKIE]: ahSession.rawToken,
      [LEARNER_SESSION_COOKIE]: learnerSession.rawToken,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const setCookies = collectSetCookieHeaders(res);
    expect(setCookies.some((c) => c.startsWith(clearAhSessionCookie()))).toBe(true);
    expect(setCookies.some((c) => c.startsWith(clearLearnerSessionCookie()))).toBe(true);

    const ahRow = await db.accountHolderSession.findUnique({
      where: { id: ahSession.sessionId },
    });
    const learnerRow = await db.learnerDeviceSession.findUnique({
      where: { id: learnerSession.sessionId },
    });
    expect(ahRow?.revokedAt).not.toBeNull();
    expect(learnerRow?.revokedAt).not.toBeNull();
  });

  it("learner-only: revokes learner session only; AH cookie absent from response", async () => {
    const ah = await createTestAccountHolder();
    const profile = await createTestLearnerProfile(ah.id);

    const learnerSession = await createLearnerSession(profile.id);

    const req = buildLogoutRequest({
      [LEARNER_SESSION_COOKIE]: learnerSession.rawToken,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const setCookies = collectSetCookieHeaders(res);
    expect(setCookies.some((c) => c.startsWith(clearLearnerSessionCookie()))).toBe(true);
    expect(setCookies.some((c) => c.includes(AH_SESSION_COOKIE))).toBe(false);

    const learnerRow = await db.learnerDeviceSession.findUnique({
      where: { id: learnerSession.sessionId },
    });
    expect(learnerRow?.revokedAt).not.toBeNull();
  });
});
