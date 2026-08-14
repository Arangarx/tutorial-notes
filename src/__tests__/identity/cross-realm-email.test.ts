/**
 * @jest-environment node
 *
 * VERIFY-ACCT-1 — cross-realm email squatting prevention.
 *
 * Oracle: DB row counts + HTTP/action outcomes — not implementation constants.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashAccountHolderPassword } from "@/lib/account-holder-auth";
import { POST as accountHolderSignupHandler } from "@/app/api/auth/account-holder/signup/route";
import { signup as tutorSignupAction } from "@/app/signup/actions";

const STRONG_PASSWORD = "Horse-Battery!Staple42";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cross-realm.test`;
}

async function seedAdminUser(email: string): Promise<void> {
  const passwordHash = await bcrypt.hash(STRONG_PASSWORD, 10);
  await db.adminUser.create({
    data: {
      email,
      passwordHash,
      displayName: "Cross-realm tutor",
      role: "TUTOR",
      approvalStatus: "WAITLISTED",
      isTestAccount: false,
    },
  });
}

async function seedAccountHolder(email: string): Promise<void> {
  const passwordHash = await hashAccountHolderPassword(STRONG_PASSWORD);
  await db.accountHolder.create({
    data: {
      email,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
}

function tutorSignupForm(email: string): FormData {
  const form = new FormData();
  form.set("email", email);
  form.set("password", STRONG_PASSWORD);
  form.set("passwordConfirm", STRONG_PASSWORD);
  form.set("displayName", "Cross Realm Tester");
  return form;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("VERIFY-ACCT-1 — cross-realm email squatting", () => {
  describe("parent signup blocked when tutor email exists", () => {
    it("returns anti-enumeration 200 and does not create AccountHolder", async () => {
      const email = uniqueEmail("tutor-blocks-parent");
      await seedAdminUser(email);

      const adminBefore = await db.adminUser.count({ where: { email } });
      const holderBefore = await db.accountHolder.count({ where: { email } });
      expect(adminBefore).toBe(1);
      expect(holderBefore).toBe(0);

      const req = new NextRequest("http://localhost/api/auth/account-holder/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: STRONG_PASSWORD,
        }),
      });

      const res = await accountHolderSignupHandler(req);
      const body = (await res.json()) as { message?: string; error?: string };

      expect(res.status).toBe(200);
      expect(body.error).toBeUndefined();
      expect(body.message).toMatch(/registered/i);

      const holderAfter = await db.accountHolder.count({ where: { email } });
      expect(holderAfter).toBe(0);
    });
  });

  describe("tutor signup blocked when parent email exists", () => {
    it("redirects like duplicate signup and does not create AdminUser", async () => {
      const email = uniqueEmail("parent-blocks-tutor");
      await seedAccountHolder(email);

      const holderBefore = await db.accountHolder.count({ where: { email } });
      const adminBefore = await db.adminUser.count({ where: { email } });
      expect(holderBefore).toBe(1);
      expect(adminBefore).toBe(0);

      await expect(tutorSignupAction(null, tutorSignupForm(email))).rejects.toThrow(
        "NEXT_REDIRECT:/login?registered=1"
      );

      const adminAfter = await db.adminUser.count({ where: { email } });
      expect(adminAfter).toBe(0);
    });
  });

  describe("same-realm duplicate behavior unchanged", () => {
    it("parent signup with existing AccountHolder still returns 200 without second row", async () => {
      const email = uniqueEmail("parent-dup");
      await seedAccountHolder(email);

      const req = new NextRequest("http://localhost/api/auth/account-holder/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: STRONG_PASSWORD,
        }),
      });

      const res = await accountHolderSignupHandler(req);
      expect(res.status).toBe(200);
      expect(await db.accountHolder.count({ where: { email } })).toBe(1);
    });

    it("tutor signup with existing AdminUser still redirects registered=1 without second row", async () => {
      const email = uniqueEmail("tutor-dup");
      await seedAdminUser(email);

      await expect(tutorSignupAction(null, tutorSignupForm(email))).rejects.toThrow(
        "NEXT_REDIRECT:/login?registered=1"
      );
      expect(await db.adminUser.count({ where: { email } })).toBe(1);
    });
  });
});

describe("Google signIn — cross-realm block", () => {
  const mockGetAdminByEmail = jest.fn();
  const mockCreateAdminFromGoogle = jest.fn();
  const mockFindEmailRealmPresence = jest.fn();
  const mockNotify = jest.fn();
  const mockClearIntent = jest.fn();
  const mockCookiesGet = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockGetAdminByEmail.mockReset();
    mockCreateAdminFromGoogle.mockReset();
    mockFindEmailRealmPresence.mockReset();
    mockNotify.mockReset();
    mockClearIntent.mockReset();
    mockCookiesGet.mockReset();

    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

    jest.doMock("@/lib/env", () => ({
      env: {
        NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad",
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "replace-me",
      },
    }));

    jest.doMock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: mockCookiesGet,
        delete: jest.fn(),
      }),
    }));

    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: mockGetAdminByEmail,
      getAdminById: jest.fn(),
      verifyPassword: jest.fn().mockResolvedValue(false),
      createAdminFromGoogle: mockCreateAdminFromGoogle,
    }));

    jest.doMock("@/lib/cross-realm-email", () => ({
      findEmailRealmPresence: mockFindEmailRealmPresence,
      isEmailTakenInOtherRealm: jest.requireActual("@/lib/cross-realm-email")
        .isEmailTakenInOtherRealm,
    }));

    jest.doMock("@/lib/notify-operator-new-signup", () => ({
      notifyOperatorsOfNewSignup: mockNotify,
    }));

    jest.doMock("@/lib/signup-intent", () => {
      const actual = jest.requireActual("@/lib/signup-intent");
      return {
        ...actual,
        clearSignupIntentCookie: mockClearIntent,
      };
    });
  });

  async function getSignInCallback() {
    const { authOptions } = await import("@/auth-options");
    const signIn = authOptions.callbacks?.signIn;
    expect(typeof signIn).toBe("function");
    return signIn!;
  }

  it("denies Google tutor provision when AccountHolder owns the email", async () => {
    const { mintSignupIntentToken, SIGNUP_INTENT_COOKIE } = await import(
      "@/lib/signup-intent"
    );
    const intent = await mintSignupIntentToken("test-secret-32-chars-minimum-pad");

    mockGetAdminByEmail.mockResolvedValueOnce(null);
    mockCookiesGet.mockReturnValue({ name: SIGNUP_INTENT_COOKIE, value: intent });
    mockFindEmailRealmPresence.mockResolvedValue({
      normalizedEmail: "parent@gmail.com",
      inAdmin: false,
      inAccountHolder: true,
    });

    const signIn = await getSignInCallback();
    const result = await signIn({
      user: { id: "x", email: "parent@gmail.com", name: "Parent User" },
      account: { provider: "google", type: "oauth" } as any,
      profile: {} as any,
    });

    expect(result).not.toBe(true);
    expect(String(result)).toContain("not_authorized");
    expect(mockCreateAdminFromGoogle).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
