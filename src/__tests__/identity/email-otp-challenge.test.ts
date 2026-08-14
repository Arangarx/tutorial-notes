/**
 * Email OTP 2FA — unit tests (hash, TTL, single-use, rate limits, enroll/verify).
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createHash } from "node:crypto";

const ORIG_ENV = { ...process.env };

describe("email OTP challenge helpers", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it("hashEmailOtpCode uses SHA-256 hex and never equals plaintext", async () => {
    const { hashEmailOtpCode } = await import("@/lib/email-otp-challenge");
    const code = "123456";
    const hash = hashEmailOtpCode(code);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(createHash("sha256").update(code, "utf8").digest("hex"));
    expect(hash).not.toBe(code);
  });

  it("generateEmailOtpCode returns 6 digits", async () => {
    const { generateEmailOtpCode } = await import("@/lib/email-otp-challenge");
    const code = generateEmailOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe("email OTP challenge DB behaviour", () => {
  const adminUserId = "email-otp-test-admin";
  const twoFaId = "email-otp-test-twofa";

  async function ensureTestAdmin(): Promise<void> {
    const { db } = await import("@/lib/db");
    await db.adminUser.upsert({
      where: { id: adminUserId },
      create: {
        id: adminUserId,
        email: "email-otp-test@example.com",
        passwordHash: "test",
        role: "TUTOR",
        approvalStatus: "APPROVED",
      },
      update: {},
    });
    await db.adminUser2FA.upsert({
      where: { adminUserId },
      create: {
        id: twoFaId,
        adminUserId,
        method: "EMAIL_OTP",
        totpSecretEnc: null,
        enrolledAt: new Date(),
      },
      update: { method: "EMAIL_OTP", totpSecretEnc: null },
    });
  }

  beforeEach(async () => {
    jest.resetModules();
    await ensureTestAdmin();
    const { db } = await import("@/lib/db");
    await db.adminUser2FAEmailChallenge.deleteMany({ where: { adminUserId } });
    await db.authThrottle.deleteMany({
      where: { scopeKey: { startsWith: "2fa-email-send:" } },
    });
  });

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    await db.adminUser2FAEmailChallenge.deleteMany({ where: { adminUserId } });
    await db.authThrottle.deleteMany({
      where: { scopeKey: { startsWith: "2fa-email-send:" } },
    });
    await db.adminUser2FA.deleteMany({ where: { adminUserId } });
    await db.adminUser.deleteMany({ where: { id: adminUserId } });
  });

  it("verify rejects expired challenge (TTL oracle)", async () => {
    const {
      createEmailOtpChallenge,
      verifyEmailOtpChallenge,
      hashEmailOtpCode,
    } = await import("@/lib/email-otp-challenge");
    const code = "654321";
    await createEmailOtpChallenge({
      adminUserId,
      twoFaId,
      purpose: "LOGIN",
      plaintextCode: code,
    });
    const { db } = await import("@/lib/db");
    await db.adminUser2FAEmailChallenge.updateMany({
      where: { adminUserId, codeHash: hashEmailOtpCode(code) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const result = await verifyEmailOtpChallenge({
      adminUserId,
      code,
      purpose: "LOGIN",
    });
    expect(result.ok).toBe(false);
  });

  it("challenge is single-use", async () => {
    const { createEmailOtpChallenge, verifyEmailOtpChallenge } = await import(
      "@/lib/email-otp-challenge"
    );
    const code = "112233";
    await createEmailOtpChallenge({
      adminUserId,
      twoFaId,
      purpose: "ENROLL",
      plaintextCode: code,
    });
    const first = await verifyEmailOtpChallenge({
      adminUserId,
      code,
      purpose: "ENROLL",
    });
    expect(first.ok).toBe(true);
    const second = await verifyEmailOtpChallenge({
      adminUserId,
      code,
      purpose: "ENROLL",
    });
    expect(second.ok).toBe(false);
  });

  it("send rate limit blocks after 3 sends / 15 min", async () => {
    jest.mock("@/lib/email", () => ({
      sendMail: jest.fn().mockResolvedValue({ sent: true }),
    }));

    const { sendEmailOtpChallenge, EMAIL_OTP_SEND_MAX } = await import(
      "@/lib/email-otp-challenge"
    );
    expect(EMAIL_OTP_SEND_MAX).toBe(3);

    for (let i = 0; i < 3; i++) {
      const r = await sendEmailOtpChallenge({
        adminUserId,
        email: "otp-test@example.com",
        purpose: "LOGIN",
        twoFaId,
      });
      expect(r.ok).toBe(true);
    }

    const blocked = await sendEmailOtpChallenge({
      adminUserId,
      email: "otp-test@example.com",
      purpose: "LOGIN",
      twoFaId,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toMatch(/Too many code requests/i);
    }
  });

  it("new send invalidates prior unused challenges", async () => {
    jest.mock("@/lib/email", () => ({
      sendMail: jest.fn().mockResolvedValue({ sent: true }),
    }));

    const { sendEmailOtpChallenge, verifyEmailOtpChallenge } = await import(
      "@/lib/email-otp-challenge"
    );
    const firstCode = "111111";
    const { db } = await import("@/lib/db");
    const { hashEmailOtpCode } = await import("@/lib/email-otp-challenge");
    await db.adminUser2FAEmailChallenge.create({
      data: {
        adminUserId,
        twoFaId,
        codeHash: hashEmailOtpCode(firstCode),
        purpose: "LOGIN",
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    await sendEmailOtpChallenge({
      adminUserId,
      email: "otp-test@example.com",
      purpose: "LOGIN",
      twoFaId,
    });

    const stale = await verifyEmailOtpChallenge({
      adminUserId,
      code: firstCode,
      purpose: "LOGIN",
    });
    expect(stale.ok).toBe(false);
  });

  it("sendEmailOtpChallenge returns honest error when sendMail fails", async () => {
    jest.resetModules();
    jest.mock("@/lib/email", () => ({
      sendMail: jest.fn().mockResolvedValue({ sent: false, error: "SMTP unavailable" }),
    }));

    await ensureTestAdmin();
    const { sendEmailOtpChallenge } = await import("@/lib/email-otp-challenge");
    const result = await sendEmailOtpChallenge({
      adminUserId,
      email: "email-otp-test@example.com",
      purpose: "ENROLL",
      twoFaId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/could not send/i);
    }
  });
});

describe("email OTP logging hygiene", () => {
  it("sendEmailOtpChallenge logs do not contain plaintext OTP", async () => {
    jest.resetModules();
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    jest.mock("@/lib/email", () => ({
      sendMail: jest.fn().mockImplementation(async (opts: { text?: string }) => {
        const match = opts.text?.match(/\n(\d{6})\n/);
        return { sent: true, _capturedCode: match?.[1] };
      }),
    }));

    try {
      const { db } = await import("@/lib/db");
      await db.adminUser.upsert({
        where: { id: "log-hygiene-admin" },
        create: {
          id: "log-hygiene-admin",
          email: "log@example.com",
          passwordHash: "test",
          role: "TUTOR",
          approvalStatus: "APPROVED",
        },
        update: {},
      });
      const { sendEmailOtpChallenge } = await import("@/lib/email-otp-challenge");
      await sendEmailOtpChallenge({
        adminUserId: "log-hygiene-admin",
        email: "log@example.com",
        purpose: "LOGIN",
      });
      const joined = logs.join("\n");
      const otpInLogs = joined.match(/\b\d{6}\b/g);
      expect(otpInLogs ?? []).toHaveLength(0);
    } finally {
      console.log = origLog;
      const { db } = await import("@/lib/db");
      await db.adminUser2FAEmailChallenge.deleteMany({
        where: { adminUserId: "log-hygiene-admin" },
      });
      await db.authThrottle.deleteMany({
        where: { scopeKey: "2fa-email-send:log-hygiene-admin" },
      });
      await db.adminUser.deleteMany({ where: { id: "log-hygiene-admin" } });
    }
  });
});
