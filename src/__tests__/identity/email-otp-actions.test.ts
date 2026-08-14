// @ts-nocheck — Jest 30 mock factory inference produces `never` return types.
/**
 * Email OTP 2FA server actions — enrollment rollback, rate limits, session mint.
 *
 * RED-BEFORE guards:
 *   - startEmailOtpEnrollment: removing deleteMany rollback (~476–478) leaves a row after send failure.
 *   - confirmEmailOtpEnrollment / verifyEmailOtpCode: removing check2faVerifyRateLimit lets OTP validation run.
 *   - confirmEmailOtpEnrollment: omitting mintTwoFactorVerifiedSession breaks post-enroll session parity.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const ORIG_ENV = { ...process.env };
const ADMIN_ID = "email-otp-action-admin";

function setupAuthMocks(): void {
  jest.mock("next-auth", () => ({
    getServerSession: jest.fn().mockResolvedValue({
      user: { email: "email-otp@example.com", id: ADMIN_ID, isTestAccount: false },
    }),
  }));
  jest.mock("@/auth-options", () => ({ authOptions: {} }));
  jest.mock("@/lib/student-scope", () => ({
    requireStudentScope: jest.fn().mockResolvedValue({ kind: "admin", adminId: ADMIN_ID }),
  }));
  jest.mock("next/navigation", () => ({
    redirect: jest.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
  }));
}

beforeEach(() => {
  jest.resetModules();
  process.env.NEXTAUTH_SECRET = "test-nextauth-secret-must-be-at-least-32-chars-long";
  process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 0xaa).toString("base64url");
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("startEmailOtpEnrollment — rollback on send failure", () => {
  it("returns ok:false and deletes pending AdminUser2FA when sendEmailOtpChallenge fails", async () => {
    const tfaRows = new Map<string, { id: string; adminUserId: string; method: string }>();

    setupAuthMocks();

    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockImplementation(async ({ where, select }) => {
            if (select?.email) {
              return { email: "email-otp@example.com" };
            }
            return { id: where.id, isTestAccount: false };
          }),
        },
        adminUser2FA: {
          deleteMany: jest.fn().mockImplementation(async ({ where }) => {
            const had = tfaRows.has(where.adminUserId);
            tfaRows.delete(where.adminUserId);
            return { count: had ? 1 : 0 };
          }),
          create: jest.fn().mockImplementation(async ({ data, select }) => {
            const row = {
              id: "tfa-pending-1",
              adminUserId: data.adminUserId,
              method: data.method,
              totpSecretEnc: data.totpSecretEnc,
              enrolledAt: data.enrolledAt,
            };
            tfaRows.set(data.adminUserId, row);
            return select ? { id: row.id } : row;
          }),
          findUnique: jest.fn().mockImplementation(async ({ where }) => {
            return tfaRows.get(where.adminUserId) ?? null;
          }),
        },
      },
    }));

    const mockSend = jest.fn().mockResolvedValue({
      ok: false,
      error: "We could not send a verification code. Try again shortly.",
    });

    jest.mock("@/lib/email-otp-challenge", () => ({
      sendEmailOtpChallenge: mockSend,
      verifyEmailOtpChallenge: jest.fn(),
    }));

    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn(),
    }));

    const { startEmailOtpEnrollment } = await import("@/app/admin/settings/2fa/actions");
    const result = await startEmailOtpEnrollment();

    expect(result.ok).toBe(false);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        purpose: "ENROLL",
        twoFaId: "tfa-pending-1",
      })
    );

    const { db } = await import("@/lib/db");
    const remaining = await db.adminUser2FA.findUnique({
      where: { adminUserId: ADMIN_ID },
    });
    expect(remaining).toBeNull();
  });
});

describe("email OTP actions — verify rate limit before OTP validation", () => {
  it("confirmEmailOtpEnrollment returns rate-limit error without calling verifyEmailOtpChallenge", async () => {
    setupAuthMocks();

    const mockVerify = jest.fn().mockResolvedValue({ ok: true });

    jest.mock("@/lib/auth-rate-limit", () => ({
      check2faVerifyRateLimit: jest.fn().mockResolvedValue({
        allowed: false,
        requestCount: 25,
        retryAfterMs: 45_000,
      }),
    }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue({ id: ADMIN_ID, isTestAccount: false }),
        },
        adminUser2FA: {
          findUnique: jest.fn().mockResolvedValue({
            id: "tfa-enroll",
            method: "EMAIL_OTP",
            enrolledAt: null,
          }),
          update: jest.fn(),
        },
      },
    }));

    jest.mock("@/lib/email-otp-challenge", () => ({
      sendEmailOtpChallenge: jest.fn(),
      verifyEmailOtpChallenge: mockVerify,
    }));

    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn(),
    }));

    const { confirmEmailOtpEnrollment } = await import("@/app/admin/settings/2fa/actions");
    const result = await confirmEmailOtpEnrollment("123456");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Too many verification attempts/i);
      expect(result.error).toContain("45");
    }
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("verifyEmailOtpCode returns rate-limit error without calling verifyEmailOtpChallenge", async () => {
    setupAuthMocks();

    const mockVerify = jest.fn().mockResolvedValue({ ok: true });

    jest.mock("@/lib/auth-rate-limit", () => ({
      check2faVerifyRateLimit: jest.fn().mockResolvedValue({
        allowed: false,
        requestCount: 30,
        retryAfterMs: 60_000,
      }),
    }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue({ id: ADMIN_ID, isTestAccount: false }),
        },
        adminUser2FA: {
          findUnique: jest.fn().mockResolvedValue({
            id: "tfa-login",
            method: "EMAIL_OTP",
            enrolledAt: new Date(),
          }),
          update: jest.fn(),
        },
      },
    }));

    jest.mock("@/lib/email-otp-challenge", () => ({
      sendEmailOtpChallenge: jest.fn(),
      verifyEmailOtpChallenge: mockVerify,
    }));

    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn(),
    }));

    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({ get: jest.fn(), set: jest.fn() }),
      headers: jest.fn().mockResolvedValue({ get: jest.fn() }),
    }));

    const { verifyEmailOtpCode } = await import("@/app/admin/settings/2fa/actions");
    const result = await verifyEmailOtpCode("654321");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Too many verification attempts/i);
      expect(result.error).toContain("60");
    }
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

describe("confirmEmailOtpEnrollment — session mint parity with TOTP enroll", () => {
  it("calls mintTwoFactorVerifiedSession after successful ENROLL verification", async () => {
    setupAuthMocks();

    const mockMint = jest.fn().mockResolvedValue(undefined);
    const sessionToken = "session-token-for-mint";
    const decodedToken = { sub: ADMIN_ID, email: "email-otp@example.com" };

    jest.mock("@/lib/auth-rate-limit", () => ({
      check2faVerifyRateLimit: jest.fn().mockResolvedValue({
        allowed: true,
        requestCount: 1,
        retryAfterMs: 0,
      }),
    }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue({ id: ADMIN_ID, isTestAccount: false }),
        },
        adminUser2FA: {
          findUnique: jest.fn().mockResolvedValue({
            id: "tfa-enroll-mint",
            method: "EMAIL_OTP",
            enrolledAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      },
    }));

    jest.mock("@/lib/email-otp-challenge", () => ({
      sendEmailOtpChallenge: jest.fn(),
      verifyEmailOtpChallenge: jest.fn().mockResolvedValue({ ok: true }),
    }));

    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue({ value: sessionToken }),
        set: jest.fn(),
      }),
      headers: jest.fn().mockResolvedValue({ get: jest.fn() }),
    }));

    jest.mock("next-auth/jwt", () => ({
      decode: jest.fn().mockResolvedValue(decodedToken),
    }));

    jest.mock("@/lib/two-factor-session", () => ({
      mintTwoFactorVerifiedSession: mockMint,
    }));

    jest.mock("@/lib/two-factor-step-up", () => ({
      verifyTotpStepUp: jest.fn(),
    }));

    const { confirmEmailOtpEnrollment } = await import("@/app/admin/settings/2fa/actions");
    const result = await confirmEmailOtpEnrollment("112233");

    expect(result.ok).toBe(true);
    expect(mockMint).toHaveBeenCalledTimes(1);
    expect(mockMint).toHaveBeenCalledWith(decodedToken);
  });
});
