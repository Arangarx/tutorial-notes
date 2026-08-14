/**
 * @jest-environment node
 *
 * Google Calendar OAuth connect flow — separate from NextAuth sign-in scopes.
 */
import { NextRequest } from "next/server";
import { getGoogleCalendarConnectionForTutor } from "@/lib/calendar-oauth";

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

const mockGetAdminByEmail = jest.fn();
jest.mock("@/lib/auth-db", () => ({
  getAdminByEmail: (...args: unknown[]) => mockGetAdminByEmail(...args),
}));

const mockEnv = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
};
jest.mock("@/lib/env", () => ({
  env: mockEnv,
}));

const mockDeleteMany = jest.fn();
const mockCreate = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    oAuthCalendarConnection: {
      findFirst: jest.fn(),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  mockGetServerSession.mockResolvedValue({ user: { email: "tutor@example.com" } });
  mockGetAdminByEmail.mockResolvedValue({ id: "admin-1" });
  mockDeleteMany.mockResolvedValue({ count: 0 });
  mockCreate.mockResolvedValue({ id: "conn-1" });
});

describe("NextAuth Google provider scopes", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "replace-me";
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it("keeps sign-in scope to openid email profile only (no calendar scopes)", async () => {
    const { authOptions } = await import("@/auth-options");
    const googleProvider = authOptions.providers?.find(
      (p) => (p as { id?: string }).id === "google"
    ) as { options?: { authorization?: { params?: { scope?: string } } } } | undefined;
    expect(googleProvider).toBeDefined();
    const scope = googleProvider?.options?.authorization?.params?.scope ?? "";
    expect(scope).toBe("openid email profile");
    expect(scope.toLowerCase()).not.toContain("calendar");
  });
});

describe("GET /api/auth/calendar/connect", () => {
  it("redirects unauthenticated users to login", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/auth/calendar/connect/route");
    const res = await GET();
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("302 includes both calendar scopes on the Google authorize URL", async () => {
    const { GET } = await import("@/app/api/auth/calendar/connect/route");
    const res = await GET();
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("calendar.events");
    expect(location).toContain("calendar.readonly");
    expect(location).toContain("userinfo.email");
    expect(location).toContain("access_type=offline");
    expect(location).toContain("prompt=consent");
    expect(location).toContain(
      encodeURIComponent("http://localhost:3000/api/auth/calendar/callback")
    );
  });
});

describe("GET /api/auth/calendar/callback", () => {
  it("stores refresh token and email after successful exchange", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          refresh_token: "refresh-abc",
          access_token: "access-abc",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: "calendar@example.com" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: "primary" }, { id: "work" }] }),
      });

    const { GET } = await import("@/app/api/auth/calendar/callback/route");
    const req = new NextRequest(
      "http://localhost:3000/api/auth/calendar/callback?code=oauth-code-123"
    );
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain("connected=google_calendar");
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { provider: "google", adminUserId: "admin-1" },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        provider: "google",
        refreshToken: "refresh-abc",
        email: "calendar@example.com",
        calendarCount: 2,
        adminUserId: "admin-1",
      },
    });
  });

  it("redirects with db_not_ready when OAuthCalendarConnection model is missing", async () => {
    jest.resetModules();
    jest.doMock("@/lib/db", () => ({ db: {} }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        refresh_token: "refresh-abc",
        access_token: "access-abc",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ email: "calendar@example.com" }),
    });

    const { GET } = await import("@/app/api/auth/calendar/callback/route");
    const req = new NextRequest(
      "http://localhost:3000/api/auth/calendar/callback?code=oauth-code-123"
    );
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain("error=db_not_ready");
  });
});

describe("disconnectGoogleCalendar server action", () => {
  const mockRequireStudentScope = jest.fn();
  const mockRevalidatePath = jest.fn();
  const mockRedirect = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: (...args: unknown[]) => mockRequireStudentScope(...args),
    }));
    jest.doMock("next/cache", () => ({
      revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
    }));
    jest.doMock("next/navigation", () => ({
      redirect: (...args: unknown[]) => {
        mockRedirect(...args);
        throw new Error("NEXT_REDIRECT");
      },
    }));
    jest.doMock("@/lib/db", () => ({
      db: {
        oAuthCalendarConnection: {
          findFirst: jest.fn(),
          deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
          create: (...args: unknown[]) => mockCreate(...args),
        },
      },
    }));
    mockRequireStudentScope.mockResolvedValue({ kind: "admin", adminId: "admin-1" });
    mockDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("deletes the google calendar row for the admin", async () => {
    const { disconnectGoogleCalendar } = await import(
      "@/app/admin/settings/integrations/actions"
    );
    await expect(disconnectGoogleCalendar()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { provider: "google", adminUserId: "admin-1" },
    });
    expect(mockRedirect).toHaveBeenCalledWith("/admin/settings/integrations");
  });
});

describe("calendar-oauth defensive paths", () => {
  it("getGoogleCalendarConnectionForTutor returns null when table throws", async () => {
    jest.resetModules();
    const err = new Error(
      "The table `main.OAuthCalendarConnection` does not exist in the current database."
    );
    err.name = "PrismaClientKnownRequestError";
    jest.doMock("@/lib/db", () => ({
      db: {
        oAuthCalendarConnection: {
          findFirst: jest.fn().mockRejectedValue(err),
        },
      },
    }));
    const { getGoogleCalendarConnectionForTutor: getConn } = await import("@/lib/calendar-oauth");
    const result = await getConn("admin-1");
    expect(result).toBeNull();
  });
});
