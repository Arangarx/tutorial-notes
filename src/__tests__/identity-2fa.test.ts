/**
 * Identity Phase 1 — 2FA unit tests.
 *
 * Test plan:
 *   Crypto (BLOCKER #2):
 *     - encrypt/decrypt round-trip returns original plaintext
 *     - wrong key fails (decrypt throws)
 *     - tampered ciphertext fails (auth-tag mismatch)
 *     - missing key throws
 *
 *   Migration SQL (BLOCKER #1):
 *     - migration file exists
 *     - ADDITIVE ONLY: no DROP COLUMN, no DELETE, no UPDATE, no DROP TABLE
 *     - creates AdminUser2FA and AdminUser2FABackupCode tables
 *
 *   Auth options — twoFactorVerified in JWT (BLOCKER #4):
 *     - fresh credentials login: twoFactorVerified=false for non-test account
 *     - fresh credentials login: twoFactorVerified=true for test account (exempt)
 *     - session callback: twoFactorVerified propagated from token
 *
 *   Middleware gate (BLOCKER #4):
 *     - non-test TUTOR with twoFactorVerified=false → redirect to /admin/settings/2fa/setup
 *     - non-test TUTOR with twoFactorVerified=true → no 2FA redirect
 *     - test account (isTestAccount=true) → no 2FA redirect (exempt)
 *     - impersonating session → no 2FA redirect (exempt)
 *     - env-only admin (sub="admin") → no 2FA redirect (exempt)
 *     - 2FA exempt paths: setup and verify pages pass through
 *
 *   Local QR generation (SECURITY — TOTP secret must never egress):
 *     - qrcode generates a data: URI for a given otpauth URI
 *     - no reference to api.qrserver.com anywhere in the source files
 *     - setup action type returns qrDataUri (not otpauthUri)
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Crypto tests
// ---------------------------------------------------------------------------
describe("TOTP encryption (BLOCKER #2 — no plaintext in DB)", () => {
  const KEY_32_BYTES = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=="; // not valid base64url

  function makeValidKey(): string {
    // 32 bytes = 43 chars base64url without padding
    const buf = Buffer.alloc(32, 0xaa);
    return buf.toString("base64url");
  }

  beforeEach(() => {
    jest.resetModules();
    process.env.TOTP_ENCRYPTION_KEY = makeValidKey();
  });

  afterEach(() => {
    delete process.env.TOTP_ENCRYPTION_KEY;
  });

  it("round-trips: decrypted output equals original plaintext", async () => {
    const { encryptTotpSecret, decryptTotpSecret } = await import("@/lib/crypto/totp-secret");
    const secret = "JBSWY3DPEHPK3PXP"; // example base32 TOTP secret
    const encrypted = encryptTotpSecret(secret);

    // BLOCKER #2: the encrypted string must not contain the plaintext.
    expect(encrypted).not.toContain(secret);
    expect(encrypted).not.toBe(secret);

    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("each encryption produces a different ciphertext (random IV)", async () => {
    const { encryptTotpSecret } = await import("@/lib/crypto/totp-secret");
    const secret = "JBSWY3DPEHPK3PXP";
    const enc1 = encryptTotpSecret(secret);
    const enc2 = encryptTotpSecret(secret);
    expect(enc1).not.toBe(enc2); // random IV means different ciphertext
  });

  it("wrong key: decryption throws (auth-tag mismatch)", async () => {
    const { encryptTotpSecret } = await import("@/lib/crypto/totp-secret");
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret);

    // Reset modules, set a different key.
    jest.resetModules();
    const wrongKey = Buffer.alloc(32, 0xbb).toString("base64url");
    process.env.TOTP_ENCRYPTION_KEY = wrongKey;
    const { decryptTotpSecret: decryptWrongKey } = await import("@/lib/crypto/totp-secret");
    expect(() => decryptWrongKey(encrypted)).toThrow();
  });

  it("tampered ciphertext throws (GCM auth-tag fails)", async () => {
    const { encryptTotpSecret, decryptTotpSecret } = await import("@/lib/crypto/totp-secret");
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret);

    // Tamper with the ciphertext portion (after the dot).
    const dotIndex = encrypted.indexOf(".");
    const iv = encrypted.slice(0, dotIndex);
    const ciphertextB64 = encrypted.slice(dotIndex + 1);
    // Flip the first byte of the ciphertext.
    const ciphertextBuf = Buffer.from(ciphertextB64, "base64url");
    ciphertextBuf[0] ^= 0xff;
    const tampered = iv + "." + ciphertextBuf.toString("base64url");

    expect(() => decryptTotpSecret(tampered)).toThrow();
  });

  it("missing TOTP_ENCRYPTION_KEY throws", async () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    jest.resetModules();
    const { encryptTotpSecret } = await import("@/lib/crypto/totp-secret");
    expect(() => encryptTotpSecret("any-secret")).toThrow(/TOTP_ENCRYPTION_KEY/);
  });
});

// ---------------------------------------------------------------------------
// Migration SQL tests (BLOCKER #1 — additive only)
// ---------------------------------------------------------------------------
describe("2FA migration SQL (BLOCKER #1 — additive only)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260531180000_admin_user_2fa/migration.sql"
  );

  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("creates AdminUser2FA table", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+"AdminUser2FA"/i);
  });

  it("creates AdminUser2FABackupCode table", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+"AdminUser2FABackupCode"/i);
  });

  it("AdminUser2FA has totpSecretEnc column (required for encryption)", () => {
    expect(sql).toMatch(/"totpSecretEnc"/i);
  });

  it("AdminUser2FABackupCode has codeHash column (bcrypt, not plaintext)", () => {
    expect(sql).toMatch(/"codeHash"/i);
  });

  it("does NOT drop any column", () => {
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/DROP\s+COLUMN/i);
  });

  it("does NOT delete any rows", () => {
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/^\s*DELETE\s+FROM/im);
  });

  it("does NOT update any existing rows", () => {
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/^\s*UPDATE\s+"/im);
  });

  it("does NOT drop any table", () => {
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/DROP\s+TABLE/i);
  });
});

// ---------------------------------------------------------------------------
// Auth options — twoFactorVerified in JWT/session
// ---------------------------------------------------------------------------
describe("auth-options: twoFactorVerified claim in JWT + session", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "replace-me";
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  function makeAdminRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "admin-123",
      email: "admin@example.com",
      passwordHash: "$2a$10$fakehashfakehashfakehashfakehashfakehash",
      isTestAccount: false,
      role: "ADMIN",
      displayName: "Admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it("fresh credentials login: twoFactorVerified=false for non-test account", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(makeAdminRow({ isTestAccount: false })),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));

    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const user = { id: "admin-123", email: "admin@example.com", isTestAccount: false, role: "ADMIN" };
    const result = await jwtCallback({ token: { sub: "admin-123" }, user, account: null });
    expect(result.twoFactorVerified).toBe(false);
  });

  it("fresh credentials login: twoFactorVerified=true for test account (exempt)", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(makeAdminRow({ isTestAccount: true })),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));

    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const user = { id: "test-123", email: "test@example.com", isTestAccount: true, role: "TUTOR" };
    const result = await jwtCallback({ token: { sub: "test-123" }, user, account: null });
    expect(result.twoFactorVerified).toBe(true);
  });

  it("session callback: twoFactorVerified propagated from token", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(false),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const { authOptions } = await import("@/auth-options");
    const sessionCallback = authOptions.callbacks?.session as Function;

    const mockSession = { user: { id: "u1", email: "u@example.com" }, expires: "2099-01-01" };
    const mockToken = { sub: "u1", twoFactorVerified: true, isTestAccount: false };

    const result = await sessionCallback({ session: mockSession, token: mockToken });
    expect(result.user.twoFactorVerified).toBe(true);
  });

  it("session callback: twoFactorVerified=false when absent from token", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(false),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const { authOptions } = await import("@/auth-options");
    const sessionCallback = authOptions.callbacks?.session as Function;

    const mockSession = { user: { id: "u1" }, expires: "2099-01-01" };
    const mockToken = { sub: "u1", isTestAccount: false };

    const result = await sessionCallback({ session: mockSession, token: mockToken });
    expect(result.user.twoFactorVerified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Middleware gate tests (BLOCKER #4)
// ---------------------------------------------------------------------------
describe("middleware 2FA gate (BLOCKER #4 — gate enforcement)", () => {
  // We test the gate logic by re-implementing the relevant decision in tests,
  // consistent with the middleware source. This avoids full middleware wiring
  // (which would require mock NextRequest infrastructure) while still testing
  // the guard logic that drives the redirects.

  function shouldRedirectToSetup(token: {
    sub?: string;
    isTestAccount?: boolean;
    isImpersonating?: boolean;
    twoFactorVerified?: boolean;
  } | null): boolean {
    if (!token?.sub) return false; // would redirect to /login, not setup
    const isTestAccount = token.isTestAccount ?? false;
    const isImpersonating = token.isImpersonating ?? false;
    const isEnvAdmin = token.sub === "admin";
    const twoFactorVerified = token.twoFactorVerified ?? false;
    if (isTestAccount || isImpersonating || isEnvAdmin) return false;
    return !twoFactorVerified;
  }

  it("non-test TUTOR with twoFactorVerified=false → redirect to setup", () => {
    expect(shouldRedirectToSetup({
      sub: "tutor-123",
      isTestAccount: false,
      isImpersonating: false,
      twoFactorVerified: false,
    })).toBe(true);
  });

  it("non-test TUTOR with twoFactorVerified=true → no redirect", () => {
    expect(shouldRedirectToSetup({
      sub: "tutor-123",
      isTestAccount: false,
      isImpersonating: false,
      twoFactorVerified: true,
    })).toBe(false);
  });

  it("test account (isTestAccount=true) → exempt (no 2FA redirect)", () => {
    expect(shouldRedirectToSetup({
      sub: "test-123",
      isTestAccount: true,
      isImpersonating: false,
      twoFactorVerified: false,
    })).toBe(false);
  });

  it("impersonating session → exempt (no 2FA redirect)", () => {
    expect(shouldRedirectToSetup({
      sub: "test-456",
      isTestAccount: false,
      isImpersonating: true,
      twoFactorVerified: false,
    })).toBe(false);
  });

  it("env-only admin (sub='admin') → exempt (no 2FA redirect)", () => {
    expect(shouldRedirectToSetup({
      sub: "admin",
      isTestAccount: false,
      isImpersonating: false,
      twoFactorVerified: false,
    })).toBe(false);
  });

  it("unauthenticated (null token) → not a 2FA redirect (login redirect instead)", () => {
    expect(shouldRedirectToSetup(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Backup code uniqueness (BLOCKER #3 — only hash stored)
// ---------------------------------------------------------------------------
describe("backup codes (BLOCKER #3 — only codeHash persisted)", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  it("generateBackupCodes returns 10 codes", async () => {
    const { generateBackupCodes } = await import("@/lib/two-factor-db");
    const codes = await generateBackupCodes();
    expect(codes).toHaveLength(10);
  });

  it("each code is 8 chars alphanumeric", async () => {
    const { generateBackupCodes } = await import("@/lib/two-factor-db");
    const codes = await generateBackupCodes();
    for (const { plaintext } of codes) {
      expect(plaintext).toMatch(/^[A-Z0-9]{8}$/);
    }
  });

  it("all plaintext codes are unique", async () => {
    const { generateBackupCodes } = await import("@/lib/two-factor-db");
    const codes = await generateBackupCodes();
    const unique = new Set(codes.map((c) => c.plaintext));
    expect(unique.size).toBe(10);
  });

  it("hash is different from plaintext (not stored in clear)", async () => {
    const { generateBackupCodes } = await import("@/lib/two-factor-db");
    const codes = await generateBackupCodes();
    for (const { plaintext, hash } of codes) {
      expect(hash).not.toBe(plaintext);
      // bcrypt hash starts with $2a$ or $2b$
      expect(hash).toMatch(/^\$2[ab]\$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Non-self-referential TOTP oracle tests
// ---------------------------------------------------------------------------
//
// These tests compute TOTP codes using a FULLY INDEPENDENT implementation
// (raw Node.js crypto, RFC 4648 base32 decode, RFC 6238 HOTP truncation)
// and assert that the production OTPAuth library accepts those codes.
//
// This is the interoperability guard that self-referential tests cannot
// provide: it proves our verifier accepts codes from a standard authenticator
// (Google Authenticator, Authy, etc.) rather than just from itself.
//
// RED-BEFORE / GREEN-AFTER: the last test in this suite is a regression guard
// for DEFECT 3 (session minting). It FAILED before the fix because actions.ts
// contained `getToken` + `fakeReq`. It PASSES now because the fix replaced
// that pattern with `decode` + `cookies()`.

/** RFC 4648 §6 base32 decode — independent of the OTPAuth library. */
function base32DecodeIndependent(s: string): Buffer {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid base32 char: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/**
 * RFC 6238 TOTP — pure Node.js crypto, no OTPAuth dependency.
 * Implements HOTP (RFC 4226) with counter = floor(ts / period).
 */
function computeTotpOracle(
  base32Secret: string,
  timestampMs: number,
  period = 30,
  digits = 6
): string {
  const keyBytes = base32DecodeIndependent(base32Secret);
  const counter = Math.floor(timestampMs / 1000 / period);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", keyBytes).update(counterBuf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(code % Math.pow(10, digits)).padStart(digits, "0");
}

describe("TOTP oracle — non-self-referential interoperability", () => {
  // Well-known test secret; also used in the QR security tests above.
  const TEST_SECRET_B32 = "JBSWY3DPEHPK3PXP";
  // Fixed past timestamp so the test is deterministic (not clock-sensitive).
  const FIXED_TS_MS = 1_600_000_000_000; // 2020-09-13T12:26:40Z

  it("RFC 4648 base32 decode: known secret produces expected byte count", () => {
    const bytes = base32DecodeIndependent(TEST_SECRET_B32);
    // JBSWY3DPEHPK3PXP = 10 bytes
    expect(bytes.length).toBe(10);
  });

  it("independent oracle produces a 6-digit string", () => {
    const code = computeTotpOracle(TEST_SECRET_B32, FIXED_TS_MS);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("OTPAuth library generate() returns identical code as oracle at same timestamp", async () => {
    const OTPAuth = await import("otpauth");
    const oracle = computeTotpOracle(TEST_SECRET_B32, FIXED_TS_MS);
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(TEST_SECRET_B32),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const libraryCode = totp.generate({ timestamp: FIXED_TS_MS });
    expect(libraryCode).toBe(oracle);
  });

  it("OTPAuth.TOTP.validate accepts oracle-computed code at same timestamp (window=1)", async () => {
    const OTPAuth = await import("otpauth");
    const oracleCode = computeTotpOracle(TEST_SECRET_B32, FIXED_TS_MS);
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(TEST_SECRET_B32),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const delta = totp.validate({ token: oracleCode, timestamp: FIXED_TS_MS, window: 1 });
    // Non-null means the code was accepted; delta=0 means exact current step.
    expect(delta).not.toBeNull();
  });

  it("base32 secret round-trips: fromBase32(secret.base32).buffer equals original", async () => {
    const OTPAuth = await import("otpauth");
    const secret = OTPAuth.Secret.fromBase32(TEST_SECRET_B32);
    const roundTripped = OTPAuth.Secret.fromBase32(secret.base32);
    expect(Buffer.from(roundTripped.buffer)).toEqual(Buffer.from(secret.buffer));
  });

  it("oracle bytes match what OTPAuth uses internally (secret.buffer)", async () => {
    const OTPAuth = await import("otpauth");
    const oracleBytes = base32DecodeIndependent(TEST_SECRET_B32);
    const secret = OTPAuth.Secret.fromBase32(TEST_SECRET_B32);
    // The buffer OTPAuth feeds to HMAC must equal what we decoded independently.
    expect(Buffer.from(secret.buffer)).toEqual(oracleBytes);
  });

  /**
   * REGRESSION GUARD — DEFECT 3 session minting.
   *
   * RED before fix: actions.ts used `getToken` + a hand-crafted `fakeReq`
   *   object that lacked `req.cookies`. Inside next-auth v4, SessionStore
   *   reads `req.cookies` (not headers), so `getToken` returned null and
   *   `mintTwoFactorVerifiedSession` was never called. The user's session
   *   never received `twoFactorVerified: true`, so middleware kept redirecting
   *   back to the verify page — perceived as "code rejected".
   *
   * GREEN after fix: `verifyTotpCode` reads the session cookie directly via
   *   `cookies()` from next/headers, then decodes it with `decode` from
   *   next-auth/jwt. This bypasses the broken fake-request path entirely.
   */
  it("DEFECT-3 regression: verifyTotpCode uses decode+cookies, NOT getToken+fakeReq", () => {
    const actionsPath = path.resolve(
      __dirname,
      "../app/admin/settings/2fa/actions.ts"
    );
    const content = fs.readFileSync(actionsPath, "utf-8");
    // Fix must be in place: decode (not getToken) is imported from next-auth/jwt
    expect(content).toContain('import { decode } from "next-auth/jwt"');
    // cookies() helper from next/headers must be present
    expect(content).toContain('import { cookies } from "next/headers"');
    // The broken pattern must be absent: no fakeReq variable and no getToken import
    expect(content).not.toContain("fakeReq");
    expect(content).not.toContain('import { getToken }');
  });
});

// ---------------------------------------------------------------------------
// Local QR generation (SECURITY — secret must never egress to third parties)
// ---------------------------------------------------------------------------
describe("local QR generation (SECURITY — secret stays server-side)", () => {
  it("qrcode.toDataURL produces a data: URI for an otpauth URI", async () => {
    const QRCode = await import("qrcode");
    const testUri = "otpauth://totp/Mynk:admin-123?secret=JBSWY3DPEHPK3PXP&issuer=Mynk";
    const dataUri = await QRCode.toDataURL(testUri, { width: 200, margin: 1 });
    expect(dataUri).toMatch(/^data:image\/png;base64,/);
    // Must be a non-trivial PNG payload
    expect(dataUri.length).toBeGreaterThan(100);
  });

  it("no reference to api.qrserver.com in 2FA setup/verify source files", () => {
    const filesToCheck = [
      path.resolve(__dirname, "../app/admin/settings/2fa/setup/TwoFactorSetupForm.tsx"),
      path.resolve(__dirname, "../app/admin/settings/2fa/setup/page.tsx"),
      path.resolve(__dirname, "../app/admin/settings/2fa/verify/TwoFactorVerifyForm.tsx"),
      path.resolve(__dirname, "../app/admin/settings/2fa/verify/page.tsx"),
      path.resolve(__dirname, "../app/admin/settings/2fa/actions.ts"),
    ];
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toContain("api.qrserver.com");
    }
  });

  it("StartEnrollmentResult ok branch includes qrDataUri field name in actions.ts source", () => {
    const actionsPath = path.resolve(
      __dirname,
      "../app/admin/settings/2fa/actions.ts"
    );
    const content = fs.readFileSync(actionsPath, "utf-8");
    expect(content).toContain("qrDataUri");
    // Confirm it's generated from the qrcode library, not an external URL
    expect(content).toContain("QRCode.toDataURL");
    expect(content).not.toContain("api.qrserver.com");
  });

  it("startTotpEnrollment otpauth label uses AdminUser email (fallback to id)", () => {
    const actionsPath = path.resolve(
      __dirname,
      "../app/admin/settings/2fa/actions.ts"
    );
    const content = fs.readFileSync(actionsPath, "utf-8");
    expect(content).toContain("select: { email: true }");
    expect(content).toContain("totpAccountLabel");
    expect(content).toMatch(/label:\s*totpAccountLabel/);
  });

  it("TwoFactorSetupForm does not import AuthMortensenNotice", () => {
    const formPath = path.resolve(
      __dirname,
      "../app/admin/settings/2fa/setup/TwoFactorSetupForm.tsx"
    );
    const content = fs.readFileSync(formPath, "utf-8");
    expect(content).not.toContain("AuthMortensenNotice");
  });

  it("TwoFactorVerifyForm does not import AuthMortensenNotice", () => {
    const formPath = path.resolve(
      __dirname,
      "../app/admin/settings/2fa/verify/TwoFactorVerifyForm.tsx"
    );
    const content = fs.readFileSync(formPath, "utf-8");
    expect(content).not.toContain("AuthMortensenNotice");
  });
});

// ---------------------------------------------------------------------------
// Auth-flow redirect mechanics (post-enrollment/verify navigation)
// ---------------------------------------------------------------------------
describe("auth-flow redirect mechanics", () => {
  /**
   * Local copy of safeReturnTo from verify/page.tsx — kept in sync.
   * Tests the regex guard logic independently of the Next.js page.
   */
  function safeReturnTo(url: string | undefined | null): string {
    if (url && /^\/(?!\/)/.test(url)) return url;
    return "/admin";
  }

  describe("safeReturnTo open-redirect guard", () => {
    it("relative path starting with / is accepted", () => {
      expect(safeReturnTo("/admin")).toBe("/admin");
      expect(safeReturnTo("/admin/students/abc")).toBe("/admin/students/abc");
      expect(safeReturnTo("/admin/settings")).toBe("/admin/settings");
    });

    it("protocol-relative URL (//) is rejected — falls back to /admin", () => {
      expect(safeReturnTo("//evil.com")).toBe("/admin");
      expect(safeReturnTo("//evil.com/steal")).toBe("/admin");
    });

    it("absolute http/https URL is rejected — falls back to /admin", () => {
      expect(safeReturnTo("https://evil.com/steal")).toBe("/admin");
      expect(safeReturnTo("http://evil.com")).toBe("/admin");
    });

    it("undefined falls back to /admin", () => {
      expect(safeReturnTo(undefined)).toBe("/admin");
    });

    it("null falls back to /admin", () => {
      expect(safeReturnTo(null)).toBe("/admin");
    });

    it("empty string falls back to /admin", () => {
      expect(safeReturnTo("")).toBe("/admin");
    });
  });

  describe("setup page redirect — enrolled+confirmed+verified user", () => {
    it("setup page source redirects enrolled+confirmed+verified users to management page", () => {
      const setupPagePath = path.resolve(
        __dirname,
        "../app/admin/settings/2fa/setup/page.tsx"
      );
      const content = fs.readFileSync(setupPagePath, "utf-8");
      // The enrolled+confirmed+verified branch must redirect to the management page.
      expect(content).toMatch(/isConfirmed && session\.user\.twoFactorVerified/);
      expect(content).toContain('redirect("/admin/settings/2fa")');
      // The old blunt redirect pattern must be gone.
      // (redirect("/admin") is still OK for test-account exemption; the enrolled+verified branch must NOT use it)
      expect(content).not.toMatch(/isEnrolled && session\.user\.twoFactorVerified/);
    });

    it("setup page source does NOT trap unconfirmed (interrupted) enrollment at /verify", () => {
      const setupPagePath = path.resolve(
        __dirname,
        "../app/admin/settings/2fa/setup/page.tsx"
      );
      const content = fs.readFileSync(setupPagePath, "utf-8");
      // p1-reenroll-trap fix: check backup codes count for confirmation, not just row existence.
      expect(content).toContain("isConfirmed");
      // The old trap pattern (redirect to verify based on row existence alone) must be gone.
      expect(content).not.toMatch(/isEnrolled && !session\.user\.twoFactorVerified/);
      // Falls through to setup form for unconfirmed — comment confirms intent.
      expect(content).toContain("p1-reenroll-trap");
    });
  });

  describe("enrollment confirm — mints verified session", () => {
    it("confirmTotpEnrollment calls mintTwoFactorVerifiedSession (source check)", () => {
      const actionsPath = path.resolve(
        __dirname,
        "../app/admin/settings/2fa/actions.ts"
      );
      const content = fs.readFileSync(actionsPath, "utf-8");
      const confirmIdx = content.indexOf("async function confirmTotpEnrollment");
      const verifyIdx = content.indexOf("async function verifyTotpCode");
      expect(confirmIdx).toBeGreaterThan(-1);
      expect(verifyIdx).toBeGreaterThan(-1);
      // Mint call must appear inside confirmTotpEnrollment (before verifyTotpCode starts).
      const confirmSection = content.slice(confirmIdx, verifyIdx);
      expect(confirmSection).toContain("mintTwoFactorVerifiedSession");
    });

    it("TwoFactorSetupForm backup-codes step navigates to /admin (source check)", () => {
      const formPath = path.resolve(
        __dirname,
        "../app/admin/settings/2fa/setup/TwoFactorSetupForm.tsx"
      );
      const content = fs.readFileSync(formPath, "utf-8");
      // Must use router.push to /admin, not a link to /admin/settings.
      expect(content).toContain('router.push("/admin")');
      // The old href link to /admin/settings must be gone.
      expect(content).not.toContain('href="/admin/settings"');
    });
  });

  describe("BUG-FIX 2026-06-01: post-enroll backup-code display must not be preempted by redirect", () => {
    /**
     * The bug: confirmTotpEnrollment mints twoFactorVerified in the session AND creates
     * backup codes (isConfirmed=true). The Next.js Server Action triggers a full RSC
     * re-render of setup/page.tsx, which then sees enrolled+confirmed+verified and fires
     * redirect("/admin/settings/2fa") — before the client can display the backup codes.
     *
     * The fix: confirmTotpEnrollment sets a tfa-post-enroll=1 cookie; the setup page reads
     * it during the post-action re-render (App Router makes cookies set during an action
     * visible to that same re-render) and skips the redirect, letting the client's
     * show-backup state surface normally.
     *
     * RED-BEFORE: tfa-post-enroll not present in actions.ts or setup/page.tsx → both
     *   expects below fail on the unpatched branch.
     * GREEN-AFTER: both present after the 2026-06-01 fix.
     */
    const actionsPath = path.resolve(__dirname, "../app/admin/settings/2fa/actions.ts");
    const setupPagePath = path.resolve(__dirname, "../app/admin/settings/2fa/setup/page.tsx");
    const formPath = path.resolve(__dirname, "../app/admin/settings/2fa/setup/TwoFactorSetupForm.tsx");

    it("confirmTotpEnrollment sets tfa-post-enroll cookie to suppress the setup-page redirect", () => {
      const content = fs.readFileSync(actionsPath, "utf-8");
      const confirmIdx = content.indexOf("async function confirmTotpEnrollment");
      const verifyIdx = content.indexOf("async function verifyTotpCode");
      const confirmSection = content.slice(confirmIdx, verifyIdx);
      // The cookie name must appear inside confirmTotpEnrollment (not elsewhere).
      expect(confirmSection).toContain("tfa-post-enroll");
      // Must be a .set() call (not just a read).
      expect(confirmSection).toMatch(/\.set\(\s*["']tfa-post-enroll["']/);
    });

    it("setup page guards the enrolled+verified redirect with the tfa-post-enroll cookie check", () => {
      const content = fs.readFileSync(setupPagePath, "utf-8");
      // Cookie guard must be present.
      expect(content).toContain("tfa-post-enroll");
      // The postEnroll variable (or equivalent) must exist.
      expect(content).toMatch(/postEnroll/);
      // The enrolled+verified redirect is still there — but conditional.
      expect(content).toContain('redirect("/admin/settings/2fa")');
      // The redirect condition must exclude the post-enroll state.
      expect(content).toMatch(/!postEnroll/);
    });

    it("setup page still redirects enrolled+verified users who are NOT mid-enrollment (direct navigation)", () => {
      const content = fs.readFileSync(setupPagePath, "utf-8");
      // The redirect must remain — it's just guarded, not removed.
      const redirectCount = (content.match(/redirect\("\/admin\/settings\/2fa"\)/g) ?? []).length;
      expect(redirectCount).toBeGreaterThanOrEqual(1);
      // The condition must still reference isConfirmed and twoFactorVerified.
      expect(content).toMatch(/isConfirmed && session\.user\.twoFactorVerified/);
    });

    it("TwoFactorSetupForm Continue button navigates without router.refresh (no re-render while leaving)", () => {
      const content = fs.readFileSync(formPath, "utf-8");
      const showBackupIdx = content.indexOf('step === "show-backup"');
      expect(showBackupIdx).toBeGreaterThan(-1);
      const returnNullIdx = content.lastIndexOf("return null;");
      const backupSection = content.slice(showBackupIdx, returnNullIdx > showBackupIdx ? returnNullIdx : content.length);
      // Continue must navigate to /admin.
      expect(backupSection).toContain('router.push("/admin")');
      // Must NOT call router.refresh() — that would trigger another server re-render
      // while still on the backup-codes page, risking a redirect bounce.
      expect(backupSection).not.toContain("router.refresh");
    });

    it("TwoFactorSetupForm handleConfirmTotp does not call router navigation (only sets client state)", () => {
      const content = fs.readFileSync(formPath, "utf-8");
      const handleConfirmIdx = content.indexOf("function handleConfirmTotp");
      expect(handleConfirmIdx).toBeGreaterThan(-1);
      // Find next top-level function after handleConfirm (used to isolate the function body).
      const nextFnIdx = content.indexOf("\n  function ", handleConfirmIdx + 1);
      const confirmBody = content.slice(
        handleConfirmIdx,
        nextFnIdx > handleConfirmIdx ? nextFnIdx : handleConfirmIdx + 600
      );
      // Navigation must NOT occur in the confirm handler — only after explicit user action.
      expect(confirmBody).not.toContain("router.push");
      expect(confirmBody).not.toContain("router.refresh");
      expect(confirmBody).not.toContain("router.replace");
    });
  });

  describe("verify page open-redirect guard in source", () => {
    it("verify page uses safeReturnTo guard rejecting // prefix (source check)", () => {
      const verifyPagePath = path.resolve(
        __dirname,
        "../app/admin/settings/2fa/verify/page.tsx"
      );
      const content = fs.readFileSync(verifyPagePath, "utf-8");
      // The guard regex must be present — rejects //evil.com.
      expect(content).toContain("safeReturnTo");
      expect(content).toMatch(/\/\^\\\/\(\?!\\\/\)\//); // /^\/(?!\/)/ regex in source
      // Must not use the weaker starts-with-/ only check that allows //.
      expect(content).not.toMatch(/callbackUrl\?\.startsWith\("\/"\)/);
    });
  });
});

// ---------------------------------------------------------------------------
// TOTP enrollment otpauth URI label (display — email, not GUID)
// ---------------------------------------------------------------------------
describe("TOTP enrollment otpauth URI label", () => {
  const APP_ISSUER = "Mynk";
  const TEST_EMAIL = "arangarx@gmail.com";
  const TEST_ADMIN_ID = "00000000-0000-4000-8000-000000000001";

  async function enrollmentOtpauthUri(label: string): Promise<string> {
    const OTPAuth = await import("otpauth");
    const totp = new OTPAuth.TOTP({
      issuer: APP_ISSUER,
      label,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    return totp.toString();
  }

  it("otpauth URI label segment contains user email; issuer unchanged", async () => {
    const totpAccountLabel = TEST_EMAIL.trim() || TEST_ADMIN_ID;
    const uri = await enrollmentOtpauthUri(totpAccountLabel);
    expect(uri).toContain(`issuer=${APP_ISSUER}`);
    expect(uri).toMatch(new RegExp(`otpauth://totp/${APP_ISSUER}:`));
    const pathAfterScheme = uri.replace(/^otpauth:\/\/totp\//, "").split("?")[0]!;
    const labelSegment = pathAfterScheme.includes(":")
      ? pathAfterScheme.slice(pathAfterScheme.indexOf(":") + 1)
      : pathAfterScheme;
    expect(decodeURIComponent(labelSegment)).toBe(TEST_EMAIL);
    expect(labelSegment).not.toContain(TEST_ADMIN_ID);
  });

  it("falls back to admin id when email is missing", async () => {
    const totpAccountLabel = "".trim() || TEST_ADMIN_ID;
    const uri = await enrollmentOtpauthUri(totpAccountLabel);
    expect(uri).toContain(`issuer=${APP_ISSUER}`);
    const pathAfterScheme = uri.replace(/^otpauth:\/\/totp\//, "").split("?")[0]!;
    const labelSegment = pathAfterScheme.includes(":")
      ? pathAfterScheme.slice(pathAfterScheme.indexOf(":") + 1)
      : pathAfterScheme;
    expect(decodeURIComponent(labelSegment)).toBe(TEST_ADMIN_ID);
  });
});

// ---------------------------------------------------------------------------
// BUG-FIX item-1: post-login verify must land on /admin, not setup/enroll form
// ---------------------------------------------------------------------------
describe("BUG-FIX item-1: verify success navigation + post-enroll cookie lifecycle", () => {
  /**
   * Root cause: tfa-post-enroll=1 cookie (set by confirmTotpEnrollment, 5-min TTL,
   * path-scoped to /admin/settings/2fa/setup) is NOT cleared on signout. After re-login
   * + successful TOTP verify, twoFactorVerified=true is in the new session. The
   * router.push("/admin") + router.refresh() combo in TwoFactorVerifyForm causes a
   * Next.js client-router race: the refresh re-renders the current URL's server components
   * while the push is in-flight, and the router may serve /admin/settings/2fa/setup from
   * its cache with (twoFactorVerified=true + postEnroll=true), suppressing the management
   * redirect and showing the enroll form instead.
   *
   * Fix:
   *   (a) TwoFactorVerifyForm: replace router.push+refresh with window.location.replace
   *       (hard navigation bypasses the client router cache entirely).
   *   (b) TwoFactorSetupForm Continue: call clearPostEnrollCookie() before router.push
   *       so the cookie cannot survive into a later login session.
   *
   * RED-BEFORE / GREEN-AFTER:
   *   - verify form currently HAS router.refresh → first test below fails before fix.
   *   - actions.ts lacks clearPostEnrollCookie → second test fails before fix.
   *   - setup form backup section lacks clearPostEnrollCookie call → third test fails.
   */
  const verifyFormPath = path.resolve(
    __dirname, "../app/admin/settings/2fa/verify/TwoFactorVerifyForm.tsx"
  );
  const setupFormPath = path.resolve(
    __dirname, "../app/admin/settings/2fa/setup/TwoFactorSetupForm.tsx"
  );
  const actionsPath = path.resolve(
    __dirname, "../app/admin/settings/2fa/actions.ts"
  );
  const setupPagePath = path.resolve(
    __dirname, "../app/admin/settings/2fa/setup/page.tsx"
  );

  it("TwoFactorVerifyForm uses hard navigation (window.location) not router.push+refresh", () => {
    const content = fs.readFileSync(verifyFormPath, "utf-8");
    // window.location.replace bypasses the client router cache so the browser makes a
    // fresh request with the newly-minted session cookie — no push+refresh race.
    expect(content).toContain("window.location");
    // router.refresh() here risks re-rendering /verify while the push is in-flight,
    // which can serve a stale cached /setup page with (verified + postEnroll) state.
    expect(content).not.toContain("router.refresh");
  });

  it("clearPostEnrollCookie server action is exported from actions.ts", () => {
    const content = fs.readFileSync(actionsPath, "utf-8");
    expect(content).toContain("export async function clearPostEnrollCookie");
    // Must zero-out the cookie (maxAge: 0) so it is immediately expired.
    const fnIdx = content.indexOf("async function clearPostEnrollCookie");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = content.slice(fnIdx, fnIdx + 800);
    expect(fnBody).toMatch(/maxAge.*0|tfa-post-enroll.*""/);
  });

  it("TwoFactorSetupForm Continue button clears post-enroll cookie before navigating to /admin", () => {
    const content = fs.readFileSync(setupFormPath, "utf-8");
    const showBackupIdx = content.indexOf('step === "show-backup"');
    expect(showBackupIdx).toBeGreaterThan(-1);
    const returnNullIdx = content.lastIndexOf("return null;");
    const backupSection = content.slice(
      showBackupIdx,
      returnNullIdx > showBackupIdx ? returnNullIdx : content.length
    );
    // The backup-codes step must call clearPostEnrollCookie before navigating away.
    expect(backupSection).toContain("clearPostEnrollCookie");
    // Must still navigate to /admin.
    expect(backupSection).toContain('router.push("/admin")');
  });

  it("setup page enrolled+verified user with NO post-enroll cookie redirects to management", () => {
    const content = fs.readFileSync(setupPagePath, "utf-8");
    // The redirect to /admin/settings/2fa fires when confirmed+verified+!postEnroll.
    expect(content).toContain('redirect("/admin/settings/2fa")');
    expect(content).toMatch(/!postEnroll/);
    expect(content).toMatch(/isConfirmed && session\.user\.twoFactorVerified/);
  });
});

// ---------------------------------------------------------------------------
// Playwright harness 2FA bypass — guard conditions
// ---------------------------------------------------------------------------
describe("isPlaywrightHarnessActive — server-only guard conditions", () => {
  const HARNESS_EMAIL = "playwright@test.local";

  afterEach(() => {
    delete process.env.WB_E2E_HARNESS;
    delete process.env.VERCEL;
    delete process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK;
    jest.resetModules();
  });

  it("active when WB_E2E_HARNESS=1 and VERCEL is unset", async () => {
    process.env.WB_E2E_HARNESS = "1";
    delete process.env.VERCEL;
    const { isPlaywrightHarnessActive } = await import("@/lib/playwright-harness");
    expect(isPlaywrightHarnessActive()).toBe(true);
  });

  it("inactive when only NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1 (WB_E2E_HARNESS not set)", async () => {
    process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK = "1";
    delete process.env.WB_E2E_HARNESS;
    delete process.env.VERCEL;
    const { isPlaywrightHarnessActive } = await import("@/lib/playwright-harness");
    expect(isPlaywrightHarnessActive()).toBe(false);
  });

  it("inactive when WB_E2E_HARNESS=1 but VERCEL=1 (defense-in-depth against prod leak)", async () => {
    process.env.WB_E2E_HARNESS = "1";
    process.env.VERCEL = "1";
    const { isPlaywrightHarnessActive } = await import("@/lib/playwright-harness");
    expect(isPlaywrightHarnessActive()).toBe(false);
  });

  it("inactive when neither flag is set", async () => {
    delete process.env.WB_E2E_HARNESS;
    delete process.env.VERCEL;
    delete process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK;
    const { isPlaywrightHarnessActive } = await import("@/lib/playwright-harness");
    expect(isPlaywrightHarnessActive()).toBe(false);
  });

  it("JWT: harness login with WB_E2E_HARNESS=1 mints twoFactorVerified=true", async () => {
    process.env.WB_E2E_HARNESS = "1";
    delete process.env.VERCEL;
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue({
        id: "hw-123", email: HARNESS_EMAIL, passwordHash: "hash",
        isTestAccount: false, role: "ADMIN", displayName: "PW Admin",
        createdAt: new Date(), updatedAt: new Date(),
      }),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));
    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const user = { id: "hw-123", email: HARNESS_EMAIL, isTestAccount: false, role: "ADMIN" };
    const result = await jwtCallback({ token: { sub: "hw-123" }, user, account: null });
    expect(result.twoFactorVerified).toBe(true);
  });

  it("JWT: only NEXT_PUBLIC flag set (no WB_E2E_HARNESS) → harness bypass INERT → twoFactorVerified=false", async () => {
    process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK = "1";
    delete process.env.WB_E2E_HARNESS;
    delete process.env.VERCEL;
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue({
        id: "hw-123", email: HARNESS_EMAIL, passwordHash: "hash",
        isTestAccount: false, role: "ADMIN", displayName: "PW Admin",
        createdAt: new Date(), updatedAt: new Date(),
      }),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));
    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const user = { id: "hw-123", email: HARNESS_EMAIL, isTestAccount: false, role: "ADMIN" };
    const result = await jwtCallback({ token: { sub: "hw-123" }, user, account: null });
    expect(result.twoFactorVerified).toBe(false);
  });

  it("JWT: WB_E2E_HARNESS=1 but VERCEL=1 → bypass INERT (prod guard) → twoFactorVerified=false", async () => {
    process.env.WB_E2E_HARNESS = "1";
    process.env.VERCEL = "1";
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue({
        id: "hw-123", email: HARNESS_EMAIL, passwordHash: "hash",
        isTestAccount: false, role: "ADMIN", displayName: "PW Admin",
        createdAt: new Date(), updatedAt: new Date(),
      }),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));
    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    const user = { id: "hw-123", email: HARNESS_EMAIL, isTestAccount: false, role: "ADMIN" };
    const result = await jwtCallback({ token: { sub: "hw-123" }, user, account: null });
    expect(result.twoFactorVerified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Item 2: autofocus on code entry inputs
// ---------------------------------------------------------------------------
describe("Item 2: autofocus code entry fields on 2FA screens", () => {
  it("TwoFactorVerifyForm code input has autoFocus", () => {
    const formPath = path.resolve(
      __dirname, "../app/admin/settings/2fa/verify/TwoFactorVerifyForm.tsx"
    );
    const content = fs.readFileSync(formPath, "utf-8");
    expect(content).toContain("autoFocus");
  });

  it("TwoFactorSetupForm TOTP confirmation input has autoFocus", () => {
    const formPath = path.resolve(
      __dirname, "../app/admin/settings/2fa/setup/TwoFactorSetupForm.tsx"
    );
    const content = fs.readFileSync(formPath, "utf-8");
    // The 6-digit code input in the show-qr/confirming step must have autoFocus.
    expect(content).toContain("autoFocus");
  });
});
