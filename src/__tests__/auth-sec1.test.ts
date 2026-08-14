/**
 * SEC-1 Dispatch A — unit tests for the 7 acceptance-gate BLOCKERs.
 * SEC-1 role follow-up — additional tests for AdminRole model.
 *
 * Blocker #1: isTestAccount blocks credentials login
 * Blocker #2: verifyPassword(plain, null) returns false, does not throw
 * Blocker #3: Google signIn callback rejects unknown email
 * Blocker #4: Google signIn callback rejects test-account email
 * Blocker #5: Migration SQL is additive (no DROP COLUMN, correct DDL shape)
 * Blocker #6: assertIsAdmin() throws ImpersonationForbiddenError for TUTOR/test account session
 * Blocker #7: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET absent → GoogleProvider skipped, tsc passes
 * Role #1: role=ADMIN appears in JWT for ADMIN-role DB user
 * Role #2: role=TUTOR appears in JWT for TUTOR-role DB user
 * Role #3: assertIsAdmin() throws for TUTOR role even when isTestAccount=false
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Blocker #2: verifyPassword(plain, null) returns false, does not throw
// ---------------------------------------------------------------------------
describe("Blocker #2 — verifyPassword with null hash", () => {
  it("returns false when hash is null (does not throw)", async () => {
    jest.resetModules();
    // verifyPassword is a pure utility; no mocks needed for this test.
    const { verifyPassword } = await import("@/lib/auth-db");
    const result = await verifyPassword("anypassword", null);
    expect(result).toBe(false);
  });

  it("returns false when hash is empty string (treats falsy hashes uniformly)", async () => {
    jest.resetModules();
    const { verifyPassword } = await import("@/lib/auth-db");
    // Edge: empty string is falsy → same early-return path as null.
    const result = await verifyPassword("anypassword", "");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Blockers #1, #3, #4, #7 — auth-options + signIn callback
// ---------------------------------------------------------------------------
describe("Blockers #1, #3, #4, #7 — authOptions", () => {
  beforeEach(() => {
    jest.resetModules();
    // Minimal env required for env.ts to parse cleanly.
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "replace-me";
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  // ---- Blocker #1: test account blocked in credentials authorize() ----
  it("Blocker #1 — authorize() returns null for isTestAccount=true", async () => {
    // Mock getAdminByEmail to return a test-account row.
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest
        .fn()
        .mockResolvedValue(makeAdminRow({ isTestAccount: true })),
      verifyPassword: jest.fn().mockResolvedValue(true), // would succeed if reached
    }));

    const { authOptions } = await import("@/auth-options");
    const provider: any = authOptions.providers?.[0];
    const authorize = provider.options?.authorize ?? provider.authorize;

    const result = await authorize({
      email: "admin@example.com",
      password: "somepassword",
    });
    expect(result).toBeNull();
  });

  // ---- Blocker #1 (corollary): real admin with non-null hash passes ----
  it("Blocker #1 (corollary) — real admin with valid password passes and includes role", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest
        .fn()
        .mockResolvedValue(makeAdminRow({ isTestAccount: false, role: "ADMIN" })),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));

    const { authOptions } = await import("@/auth-options");
    const provider: any = authOptions.providers?.[0];
    const authorize = provider.options?.authorize ?? provider.authorize;

    const result = await authorize({
      email: "admin@example.com",
      password: "correct-password",
    });
    expect(result).not.toBeNull();
    expect(result?.email).toBe("admin@example.com");
    expect((result as any)?.role).toBe("ADMIN");
  });

  // ---- Blocker #1 (null hash): real admin with null passwordHash cannot log in ----
  it("Blocker #1 (null hash) — Google-OAuth-only admin with null passwordHash is rejected", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest
        .fn()
        .mockResolvedValue(
          makeAdminRow({ isTestAccount: false, passwordHash: null })
        ),
      verifyPassword: jest.fn().mockResolvedValue(false), // called with null → returns false
    }));

    const { authOptions } = await import("@/auth-options");
    const provider: any = authOptions.providers?.[0];
    const authorize = provider.options?.authorize ?? provider.authorize;

    const result = await authorize({
      email: "admin@example.com",
      password: "any-password",
    });
    expect(result).toBeNull();
  });

  // ---- Blockers #3 + #4: Google signIn callback ----
  async function getSignInCallback() {
    // Need Google creds so the GoogleProvider is included.
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

    jest.doMock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue(undefined),
        delete: jest.fn(),
      }),
    }));

    const { authOptions } = await import("@/auth-options");
    const signIn = authOptions.callbacks?.signIn;
    expect(typeof signIn).toBe("function");
    return signIn!;
  }

  it("Blocker #3 — Google signIn rejects email not in DB (no signup intent)", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(null), // unknown email
      verifyPassword: jest.fn().mockResolvedValue(false),
      createAdminFromGoogle: jest.fn(),
    }));
    jest.doMock("@/lib/notify-operator-new-signup", () => ({
      notifyOperatorsOfNewSignup: jest.fn(),
    }));

    const signIn = await getSignInCallback();
    const result = await signIn({
      user: { id: "x", email: "stranger@gmail.com" },
      account: { provider: "google", type: "oauth" } as any,
      profile: {} as any,
    });
    expect(result).not.toBe(true);
    expect(result).toContain("not_authorized");
  });

  it("Blocker #4 — Google signIn rejects test-account email", async () => {
    jest.doMock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue(undefined),
        delete: jest.fn(),
      }),
    }));
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest
        .fn()
        .mockResolvedValue(makeAdminRow({ isTestAccount: true })),
      verifyPassword: jest.fn().mockResolvedValue(false),
      createAdminFromGoogle: jest.fn(),
    }));
    jest.doMock("@/lib/notify-operator-new-signup", () => ({
      notifyOperatorsOfNewSignup: jest.fn(),
    }));

    const signIn = await getSignInCallback();
    const result = await signIn({
      user: { id: "test1", email: "arangarx+test1@gmail.com" },
      account: { provider: "google", type: "oauth" } as any,
      profile: {} as any,
    });
    expect(result).not.toBe(true);
    expect(result).toContain("not_authorized");
  });

  it("Blocker #4 (positive) — Google signIn accepts real admin email", async () => {
    jest.doMock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue(undefined),
        delete: jest.fn(),
      }),
    }));
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest
        .fn()
        .mockResolvedValue(makeAdminRow({ isTestAccount: false })),
      verifyPassword: jest.fn().mockResolvedValue(false),
      createAdminFromGoogle: jest.fn(),
    }));
    jest.doMock("@/lib/notify-operator-new-signup", () => ({
      notifyOperatorsOfNewSignup: jest.fn(),
    }));

    const signIn = await getSignInCallback();
    const result = await signIn({
      user: { id: "admin-123", email: "admin@example.com" },
      account: { provider: "google", type: "oauth" } as any,
      profile: {} as any,
    });
    expect(result).toBe(true);
  });

  // ---- Blocker #7: Missing Google creds → GoogleProvider skipped ----
  it("Blocker #7 — GoogleProvider absent when GOOGLE_CLIENT_ID/SECRET unset", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(false),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const { authOptions } = await import("@/auth-options");
    const googleProviders = authOptions.providers.filter(
      (p: any) => p.id === "google"
    );
    // When credentials are absent, no GoogleProvider should be registered.
    expect(googleProviders).toHaveLength(0);
    // CredentialsProvider should still be present.
    const credProviders = authOptions.providers.filter(
      (p: any) => p.id === "credentials"
    );
    expect(credProviders).toHaveLength(1);
  });

  it("Blocker #7 — GoogleProvider present when credentials are set", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(false),
      getAdminByEmail: jest.fn().mockResolvedValue(null),
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const { authOptions } = await import("@/auth-options");
    const googleProviders = authOptions.providers.filter(
      (p: any) => p.id === "google"
    );
    expect(googleProviders).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Blocker #5: Migration SQL is additive
// ---------------------------------------------------------------------------
describe("Blocker #5 — migration SQL is additive", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260530120000_sec1_foundation/migration.sql"
  );

  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("drops the NOT NULL constraint on passwordHash (not the column)", () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"AdminUser"\s+ALTER\s+COLUMN\s+"passwordHash"\s+DROP\s+NOT\s+NULL/i
    );
  });

  it("adds isTestAccount column with DEFAULT false", () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"AdminUser"\s+ADD\s+COLUMN\s+"isTestAccount"\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/i
    );
  });

  it("creates ImpersonationLog table", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+"ImpersonationLog"/i);
  });

  it("does NOT drop any column", () => {
    // Strip single-line SQL comments before scanning so mention in a comment
    // (e.g. "-- no DROP COLUMN") doesn't cause a false positive.
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/DROP\s+COLUMN/i);
  });

  it("does NOT delete or update any data rows", () => {
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(sqlNoComments).not.toMatch(/^\s*UPDATE\s+"AdminUser"/im);
  });

  it("does NOT drop any table", () => {
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/DROP\s+TABLE/i);
  });
});

// ---------------------------------------------------------------------------
// Blocker #6: assertIsAdmin() throws for TUTOR/test-account sessions
// (assertIsRealAdmin is kept as an alias — both names are tested)
// ---------------------------------------------------------------------------
describe("Blocker #6 — assertIsAdmin rejects non-ADMIN accounts", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  it("throws ImpersonationForbiddenError when DB row is isTestAccount=true (role=TUTOR)", async () => {
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "test-account-id",
        email: "arangarx+test1@gmail.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue(
            makeAdminRow({
              id: "test-account-id",
              isTestAccount: true,
              role: "TUTOR",
            })
          ),
        },
      },
    }));

    const { assertIsAdmin, assertIsRealAdmin, ImpersonationForbiddenError } = await import(
      "@/lib/impersonation"
    );

    await expect(assertIsAdmin()).rejects.toThrow(ImpersonationForbiddenError);
    await expect(assertIsAdmin()).rejects.toThrow("TUTOR accounts cannot impersonate");
    // Alias still works
    await expect(assertIsRealAdmin()).rejects.toThrow(ImpersonationForbiddenError);
  });

  // Role #3: TUTOR with isTestAccount=false (e.g. Sarah's real login) is also blocked.
  it("Role #3 — throws for TUTOR role even when isTestAccount=false (real tutor login)", async () => {
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "sarah-tutor-id",
        email: "sarah@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue(
            makeAdminRow({
              id: "sarah-tutor-id",
              email: "sarah@example.com",
              isTestAccount: false,
              role: "TUTOR",
            })
          ),
        },
      },
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { assertIsAdmin, ImpersonationForbiddenError } = await import(
      "@/lib/impersonation"
    );

    await expect(assertIsAdmin()).rejects.toThrow(ImpersonationForbiddenError);
    await expect(assertIsAdmin()).rejects.toThrow("TUTOR accounts cannot impersonate");
  });

  it("throws ImpersonationForbiddenError for env-only admin", async () => {
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "env",
        email: "env-admin@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    }));

    const { assertIsAdmin, ImpersonationForbiddenError } = await import(
      "@/lib/impersonation"
    );

    await expect(assertIsAdmin()).rejects.toThrow(ImpersonationForbiddenError);
    await expect(assertIsAdmin()).rejects.toThrow("Env-only admin");
  });

  it("returns adminId + email for a real admin (role=ADMIN)", async () => {
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "real-admin-id",
        email: "admin@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue(
            makeAdminRow({
              id: "real-admin-id",
              isTestAccount: false,
              role: "ADMIN",
            })
          ),
        },
      },
    }));

    jest.doMock("@/lib/env", () => ({
      env: {
        NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad",
      },
    }));

    const { assertIsAdmin, assertIsRealAdmin } = await import("@/lib/impersonation");

    const result = await assertIsAdmin();
    expect(result.adminId).toBe("real-admin-id");
    expect(result.email).toBe("admin@example.com");
    // Alias also returns correctly
    const result2 = await assertIsRealAdmin();
    expect(result2.adminId).toBe("real-admin-id");
  });
});

// ---------------------------------------------------------------------------
// assertAdminOrNotFound — page-level guard: denial → notFound(), not error boundary
// ---------------------------------------------------------------------------
describe("assertAdminOrNotFound — page-level guard for admin pages", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  it("calls notFound() (not throwing ImpersonationForbiddenError) for TUTOR role", async () => {
    // Simulate Next.js: notFound() throws a control-flow signal at runtime.
    const notFoundSignal = new Error("NEXT_NOT_FOUND");
    const notFoundMock = jest.fn().mockImplementation(() => {
      throw notFoundSignal;
    });
    jest.doMock("next/navigation", () => ({ notFound: notFoundMock, redirect: jest.fn() }));

    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "sarah-tutor-id",
        email: "sarah@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue(
            makeAdminRow({ id: "sarah-tutor-id", email: "sarah@example.com", role: "TUTOR", isTestAccount: false })
          ),
        },
      },
    }));

    const { assertAdminOrNotFound } = await import("@/lib/impersonation");

    // The call must surface the notFound signal, NOT ImpersonationForbiddenError.
    await expect(assertAdminOrNotFound()).rejects.toBe(notFoundSignal);
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT call notFound() and returns adminId+email for ADMIN role", async () => {
    const notFoundMock = jest.fn();
    jest.doMock("next/navigation", () => ({ notFound: notFoundMock, redirect: jest.fn() }));

    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "real-admin-id",
        email: "admin@example.com",
      }),
    }));

    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue(
            makeAdminRow({ id: "real-admin-id", email: "admin@example.com", role: "ADMIN", isTestAccount: false })
          ),
        },
      },
    }));

    jest.doMock("@/lib/env", () => ({
      env: { NEXTAUTH_SECRET: "test-secret-32-chars-minimum-pad" },
    }));

    const { assertAdminOrNotFound } = await import("@/lib/impersonation");

    const result = await assertAdminOrNotFound();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(result.adminId).toBe("real-admin-id");
    expect(result.email).toBe("admin@example.com");
  });

  it("re-throws unexpected (non-auth) errors without calling notFound()", async () => {
    const notFoundMock = jest.fn();
    jest.doMock("next/navigation", () => ({ notFound: notFoundMock, redirect: jest.fn() }));

    const dbError = new Error("Database connection failed");
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockRejectedValue(dbError),
    }));

    const { assertAdminOrNotFound } = await import("@/lib/impersonation");

    await expect(assertAdminOrNotFound()).rejects.toBe(dbError);
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});

describe("Role model — JWT callback propagates role from DB", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "replace-me";
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  it("Role #1 — credentials authorize returns role=ADMIN for ADMIN-role account", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(
        makeAdminRow({ isTestAccount: false, role: "ADMIN" })
      ),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));

    const { authOptions } = await import("@/auth-options");
    const provider: any = authOptions.providers?.[0];
    const authorize = provider.options?.authorize ?? provider.authorize;

    const result = await authorize({ email: "admin@example.com", password: "pw" });
    expect(result).not.toBeNull();
    expect((result as any)?.role).toBe("ADMIN");
  });

  it("Role #2 — credentials authorize returns role=TUTOR for TUTOR-role account", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(
        makeAdminRow({ isTestAccount: false, role: "TUTOR" })
      ),
      verifyPassword: jest.fn().mockResolvedValue(true),
    }));

    const { authOptions } = await import("@/auth-options");
    const provider: any = authOptions.providers?.[0];
    const authorize = provider.options?.authorize ?? provider.authorize;

    const result = await authorize({ email: "sarah@example.com", password: "pw" });
    expect(result).not.toBeNull();
    expect((result as any)?.role).toBe("TUTOR");
  });

  it("Role in session — session callback exposes role from token", async () => {
    jest.doMock("@/lib/auth-db", () => ({
      hasAdminUsers: jest.fn().mockResolvedValue(true),
      getAdminByEmail: jest.fn().mockResolvedValue(
        makeAdminRow({ isTestAccount: false, role: "ADMIN" })
      ),
      verifyPassword: jest.fn().mockResolvedValue(false),
    }));

    const { authOptions } = await import("@/auth-options");
    const sessionCallback = authOptions.callbacks?.session as Function;

    const mockSession = {
      user: { id: "admin-123", email: "admin@example.com" },
      expires: new Date().toISOString(),
    };
    const mockToken = {
      sub: "admin-123",
      isTestAccount: false,
      isImpersonating: false,
      role: "ADMIN",
    };

    const result = await sessionCallback({ session: mockSession, token: mockToken });
    expect(result.user.role).toBe("ADMIN");
  });
});
