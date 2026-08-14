// @ts-nocheck — Jest 30 mock factory inference produces `never` return types.
/**
 * verifyTotpStepUp unit tests — rate-limit ordering and step-up behaviour.
 *
 * Split from admin-trusted-device.test.ts so module-level setup is clean.
 * Uses jest.mock() inside each it() with jest.resetModules() in beforeEach,
 * the same reliable pattern as other tests in this repo.
 *
 * TD-10-A  check2faVerifyRateLimit called FIRST in verifyTotpStepUp (B3)
 * TD-15-A  When rate-limited, DB is NOT queried (fail-fast)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  process.env.NEXTAUTH_SECRET = "test-nextauth-secret-must-be-at-least-32-chars-long";
  process.env.TOTP_ENCRYPTION_KEY = "dGVzdC1lbmNyeXB0aW9uLWtleS0zMmJ5dGVz"; // 32 bytes base64
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("TD-10-A / TD-15-A: verifyTotpStepUp rate limit first (B3)", () => {
  it("calls check2faVerifyRateLimit before any DB query", async () => {
    const callOrder: string[] = [];

    const mockRateLimitFn = jest.fn().mockImplementation(async () => {
      callOrder.push("rateLimit");
      return { allowed: true, requestCount: 1, retryAfterMs: 0 };
    });
    const mockDbFindUnique = jest.fn().mockImplementation(async () => {
      callOrder.push("dbQuery");
      return { id: "tfa-row", method: "TOTP", totpSecretEnc: "enc" };
    });

    jest.mock("@/lib/auth-rate-limit", () => ({
      check2faVerifyRateLimit: mockRateLimitFn,
    }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminUser2FA: { findUnique: mockDbFindUnique },
      },
    }));

    jest.mock("@/lib/crypto/totp-secret", () => ({
      decryptTotpSecret: jest.fn().mockReturnValue("JBSWY3DPEHPK3PXP"),
    }));

    jest.mock("otpauth", () => ({
      TOTP: jest.fn().mockImplementation(() => ({
        validate: jest.fn().mockReturnValue(0),
      })),
      Secret: { fromBase32: jest.fn().mockReturnValue({}) },
    }));

    jest.mock("@/lib/two-factor-db", () => ({
      redeemBackupCode: jest.fn().mockResolvedValue(null),
    }));

    jest.mock("@/lib/email-otp-challenge", () => ({
      verifyEmailOtpChallenge: jest.fn(),
    }));

    const { verifyTotpStepUp } = await import("@/lib/two-factor-step-up");
    await verifyTotpStepUp("admin-td10a", "123456");

    expect(callOrder.length).toBeGreaterThan(0);
    expect(callOrder[0]).toBe("rateLimit");
    expect(callOrder.indexOf("rateLimit")).toBeLessThan(callOrder.indexOf("dbQuery"));
  });

  it("returns error and does NOT query DB when rate-limited (fail-fast)", async () => {
    const mockDbFindUnique = jest.fn().mockResolvedValue({ id: "tfa-15", totpSecretEnc: "enc" });

    jest.mock("@/lib/auth-rate-limit", () => ({
      check2faVerifyRateLimit: jest.fn().mockResolvedValue({
        allowed: false,
        requestCount: 99,
        retryAfterMs: 30000,
      }),
    }));

    jest.mock("@/lib/db", () => ({
      db: {
        adminUser2FA: { findUnique: mockDbFindUnique },
      },
    }));

    jest.mock("@/lib/email-otp-challenge", () => ({
      verifyEmailOtpChallenge: jest.fn(),
    }));

    const { verifyTotpStepUp } = await import("@/lib/two-factor-step-up");
    const result = await verifyTotpStepUp("admin-td15a", "123456");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/Too many/);
    expect(mockDbFindUnique).not.toHaveBeenCalled();
  });

  it("returns ok:false with seconds in error message when rate-limited", async () => {
    jest.mock("@/lib/auth-rate-limit", () => ({
      check2faVerifyRateLimit: jest.fn().mockResolvedValue({
        allowed: false,
        requestCount: 21,
        retryAfterMs: 60000,
      }),
    }));

    jest.mock("@/lib/db", () => ({
      db: { adminUser2FA: { findUnique: jest.fn() } },
    }));

    jest.mock("@/lib/email-otp-challenge", () => ({
      verifyEmailOtpChallenge: jest.fn(),
    }));

    const { verifyTotpStepUp } = await import("@/lib/two-factor-step-up");
    const result = await verifyTotpStepUp("admin-td15b", "654321");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // 60000ms → "60 seconds"
      expect(result.error).toContain("60");
    }
  });
});
