/**
 * Auth hardening — role refresh + cost-query authorization tests.
 *
 * Fix B invariants (jwt callback role re-fetch on refresh):
 *   (i)   A token whose DB role changed gets corrected on the next refresh.
 *   (ii)  Impersonation tokens (isImpersonating=true) are NOT re-fetched — role stays as-is.
 *   (iii) Legacy sub="admin" path is skipped — no DB call attempted.
 *   (iv)  Deleted account (DB returns null) fails closed: token.sub is cleared.
 *   (v)   Transient DB error fails open: existing token preserved.
 *   (vi)  Throttle: re-fetch skipped when _roleCheckedAt is within ROLE_REFRESH_INTERVAL_MS.
 *   (vii) Initial sign-in (user present) is NOT affected — role comes from authorize(), not DB re-fetch.
 *
 * Fix A invariants (getSessionCostBreakdown server-side auth):
 *   (i)   TUTOR viewer (real, non-impersonating, non-test) receives null (denied).
 *   (ii)  ADMIN viewer receives the cost breakdown (allowed).
 *   (iii) Impersonating viewer (any role) receives the cost breakdown (allowed).
 *   (iv)  Test-account viewer (isTestAccount=true) receives the cost breakdown (allowed).
 *   (v)   Unauthenticated viewer (no session) receives null (denied).
 */

// ---------------------------------------------------------------------------
// Shared env setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetModules();
  process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
  process.env.DATABASE_URL = "file:./test.db";
  process.env.DIRECT_URL = "file:./test.db";
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD = "replace-me";
});

// ---------------------------------------------------------------------------
// Fix B — jwt callback role re-fetch
// ---------------------------------------------------------------------------

describe("Fix B — jwt callback role re-fetch on token refresh", () => {
  /**
   * Helper: call the jwt callback with `user=undefined, account=null`
   * (simulating a token REFRESH, not initial sign-in) with the given token.
   */
  async function callJwtRefresh(token: Record<string, unknown>) {
    jest.doMock("@/lib/playwright-harness", () => ({
      isPlaywrightHarnessActive: () => false,
      isPlaywrightHarnessAdminEmail: () => false,
    }));
    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;
    return jwtCallback({ token, user: undefined, account: null });
  }

  it("(i) stale role is corrected when DB returns a different role", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      getAdminById: jest.fn().mockResolvedValue({
        id: "tutor-uuid",
        role: "TUTOR",
        isTestAccount: false,
      }),
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const staleToken = {
      sub: "tutor-uuid",
      role: "ADMIN",           // wrong — DB says TUTOR
      isTestAccount: false,
      isImpersonating: false,
      _roleCheckedAt: 0,        // force re-fetch
    };

    const result = await callJwtRefresh(staleToken);
    expect(result.role).toBe("TUTOR");
    expect(result.sub).toBe("tutor-uuid");
    expect(result._roleCheckedAt).toBeGreaterThan(0);
  });

  it("(ii) impersonation token is NOT re-fetched — role stays as target role", async () => {
    const getAdminById = jest.fn().mockResolvedValue({
      id: "real-admin-id",
      role: "ADMIN",
      isTestAccount: false,
    });

    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      getAdminById,
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const impersonationToken = {
      sub: "test-acct-id",
      role: "TUTOR",          // target's role — must not be overwritten
      isTestAccount: true,
      isImpersonating: true,  // key flag
      originalAdminId: "real-admin-id",
      _roleCheckedAt: 0,
    };

    const result = await callJwtRefresh(impersonationToken);

    // DB must NOT have been called
    expect(getAdminById).not.toHaveBeenCalled();
    // Role preserved as the target's role
    expect(result.role).toBe("TUTOR");
    expect(result.isImpersonating).toBe(true);
  });

  it("(iii) legacy sub='admin' path skipped — no DB call", async () => {
    const getAdminById = jest.fn();

    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(false),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      getAdminById,
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const legacyToken = {
      sub: "admin",   // env-only admin
      role: "ADMIN",
      isTestAccount: false,
      isImpersonating: false,
      _roleCheckedAt: 0,
    };

    await callJwtRefresh(legacyToken);
    expect(getAdminById).not.toHaveBeenCalled();
  });

  it("(iv) deleted account fails closed — token.sub cleared", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      getAdminById: jest.fn().mockResolvedValue(null), // account deleted
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const token = {
      sub: "deleted-uuid",
      role: "TUTOR",
      isTestAccount: false,
      isImpersonating: false,
      _roleCheckedAt: 0,
    };

    const result = await callJwtRefresh(token);
    // sub cleared → middleware treats session as unauthenticated
    expect(result.sub).toBeUndefined();
  });

  it("(v) transient DB error fails open — existing token preserved unchanged", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      getAdminById: jest.fn().mockRejectedValue(new Error("DB timeout")),
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const token = {
      sub: "some-uuid",
      role: "TUTOR",
      isTestAccount: false,
      isImpersonating: false,
      _roleCheckedAt: 0,
    };

    const result = await callJwtRefresh(token);
    // Token unchanged on DB error
    expect(result.role).toBe("TUTOR");
    expect(result.sub).toBe("some-uuid");
  });

  it("(vi) throttle: re-fetch skipped when _roleCheckedAt is recent", async () => {
    const getAdminById = jest.fn().mockResolvedValue({
      id: "some-uuid",
      role: "ADMIN",
      isTestAccount: false,
    });

    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      getAdminById,
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    const token = {
      sub: "some-uuid",
      role: "TUTOR",
      isTestAccount: false,
      isImpersonating: false,
      // Recent check — within the 5-min interval
      _roleCheckedAt: Date.now() - (FIVE_MINUTES_MS - 60_000),
    };

    await callJwtRefresh(token);
    // DB should NOT have been called because the throttle interval hasn't elapsed
    expect(getAdminById).not.toHaveBeenCalled();
  });

  it("(vii) initial sign-in (user present) sets role from authorize() result, not DB re-fetch", async () => {
    // This tests that the initial sign-in path still works correctly:
    // authorize() returns role=TUTOR for a TUTOR account, and the jwt callback
    // should apply that role to the token (not the DB re-fetch path).
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue({
        id: "tutor-uuid",
        email: "tutor@example.com",
        passwordHash: "$2a$10$fakehash",
        isTestAccount: false,
        role: "TUTOR",
        displayName: "Tutor",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      getAdminById: jest.fn(), // must NOT be called on initial sign-in
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));

    jest.doMock("@/lib/playwright-harness", () => ({
      isPlaywrightHarnessActive: () => false,
      isPlaywrightHarnessAdminEmail: () => false,
    }));

    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;

    const result = await jwtCallback({
      token: { sub: "tutor-uuid" },
      user: { id: "tutor-uuid", email: "tutor@example.com", role: "TUTOR", isTestAccount: false },
      account: { provider: "credentials", type: "credentials" },
    });

    expect(result.role).toBe("TUTOR");
    // getAdminById should NOT have been called on initial sign-in
    const { getAdminById } = await import("@/lib/auth-db");
    expect(getAdminById).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Product events — TUTOR_LOGIN on initial sign-in
// ---------------------------------------------------------------------------

describe("Product events — jwt callback logs TUTOR_LOGIN on sign-in", () => {
  const mockLogProductEvent = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.resetModules();
    mockLogProductEvent.mockReset();
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "replace-me";

    jest.doMock("@/lib/observability/product-events", () => ({
      logProductEvent: (...args: unknown[]) => mockLogProductEvent(...args),
    }));
    jest.doMock("@/lib/playwright-harness", () => ({
      isPlaywrightHarnessActive: () => false,
      isPlaywrightHarnessAdminEmail: () => false,
    }));
  });

  it("credentials login logs TUTOR_LOGIN with adminUserId + approvalStatus from token", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      getAdminById: jest.fn(),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));

    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;

    const tutorId = "tutor-waitlisted-uuid";
    await jwtCallback({
      token: { sub: tutorId },
      user: {
        id: tutorId,
        email: "waitlisted@example.com",
        role: "TUTOR",
        isTestAccount: false,
        approvalStatus: "WAITLISTED",
      },
      account: { provider: "credentials", type: "credentials" },
    });

    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "TUTOR_LOGIN",
      adminUserId: tutorId,
      metadata: {
        method: "credentials",
        approvalStatus: "WAITLISTED",
      },
    });
  });

  it("Google login logs TUTOR_LOGIN with admin id from DB row", async () => {
    const googleAdminId = "google-admin-uuid";
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue({
        id: googleAdminId,
        email: "approved@gmail.com",
        passwordHash: null,
        isTestAccount: false,
        role: "TUTOR",
        displayName: "Google Tutor",
        approvalStatus: "APPROVED",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      getAdminById: jest.fn(),
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;

    await jwtCallback({
      token: { sub: "placeholder-sub" },
      user: {
        id: "oauth-user-id",
        email: "approved@gmail.com",
        name: "Google Tutor",
      },
      account: { provider: "google", type: "oauth" },
    });

    expect(mockLogProductEvent).toHaveBeenCalledWith({
      kind: "TUTOR_LOGIN",
      adminUserId: googleAdminId,
      metadata: {
        method: "google",
        approvalStatus: "APPROVED",
      },
    });
  });

  it("token refresh (no user) does not log TUTOR_LOGIN", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      getAdminById: jest.fn().mockResolvedValue({
        id: "tutor-uuid",
        role: "TUTOR",
        isTestAccount: false,
      }),
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const { authOptions } = await import("@/auth-options");
    const jwtCallback = authOptions.callbacks?.jwt as Function;

    await jwtCallback({
      token: {
        sub: "tutor-uuid",
        role: "TUTOR",
        isTestAccount: false,
        isImpersonating: false,
        _roleCheckedAt: 0,
      },
      user: undefined,
      account: null,
    });

    expect(mockLogProductEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fix A — getSessionCostBreakdown server-side authorization
// ---------------------------------------------------------------------------

describe("Fix A — getSessionCostBreakdown server-side authorization", () => {
  const FAKE_EVENTS = [
    {
      id: "evt-1",
      kind: "WHISPER_TRANSCRIPTION",
      model: "whisper-1",
      estimatedCostUsd: { toNumber: () => 0.01 },
      createdAt: new Date(),
      audioSeconds: 60,
      inputTokens: null,
      outputTokens: null,
      bytesTransferred: null,
      gbMonths: null,
      computeGbHr: null,
    },
  ];

  function mockDb() {
    jest.doMock("@/lib/db", () => ({
      db: {
        costEvent: {
          findMany: jest.fn().mockResolvedValue(FAKE_EVENTS),
        },
      },
    }));
  }

  async function callGetSessionCostBreakdown(sessionUser: unknown) {
    jest.doMock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue(
        sessionUser ? { user: sessionUser } : null
      ),
    }));

    // auth-options is imported inside cost-queries; we mock it to avoid full env loading.
    jest.doMock("@/auth-options", () => ({ authOptions: {} }));

    const { getSessionCostBreakdown } = await import(
      "@/lib/observability/cost-queries"
    );
    return getSessionCostBreakdown("wbsid-test-123");
  }

  it("(i) TUTOR viewer (real, non-impersonating, non-test) is denied → returns null", async () => {
    mockDb();
    const result = await callGetSessionCostBreakdown({
      role: "TUTOR",
      isImpersonating: false,
      isTestAccount: false,
    });
    expect(result).toBeNull();
  });

  it("(ii) ADMIN viewer is allowed → returns cost breakdown", async () => {
    mockDb();
    const result = await callGetSessionCostBreakdown({
      role: "ADMIN",
      isImpersonating: false,
      isTestAccount: false,
    });
    expect(result).not.toBeNull();
    expect(result?.whisperMinutes).toBe(1); // 60 seconds = 1 minute
  });

  it("(iii) Impersonating viewer (TUTOR role but isImpersonating=true) is allowed → returns breakdown", async () => {
    mockDb();
    const result = await callGetSessionCostBreakdown({
      role: "TUTOR",
      isImpersonating: true,
      isTestAccount: false,
    });
    expect(result).not.toBeNull();
  });

  it("(iv) Test-account viewer (isTestAccount=true) is allowed → returns breakdown", async () => {
    mockDb();
    const result = await callGetSessionCostBreakdown({
      role: "TUTOR",
      isImpersonating: false,
      isTestAccount: true,
    });
    expect(result).not.toBeNull();
  });

  it("(v) Unauthenticated viewer (no session) is denied → returns null", async () => {
    mockDb();
    const result = await callGetSessionCostBreakdown(null);
    expect(result).toBeNull();
  });
});
