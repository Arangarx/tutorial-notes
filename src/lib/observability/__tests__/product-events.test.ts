/**
 * Unit tests for first-party product-event logging.
 */

jest.mock("@/lib/db", () => ({
  db: {
    productEvent: {
      create: jest.fn(),
    },
    adminUser: {
      findUnique: jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { logProductEvent } from "@/lib/observability/product-events";

const mockProductEventCreate = db.productEvent.create as jest.MockedFunction<
  typeof db.productEvent.create
>;
const mockAdminUserFindUnique = db.adminUser.findUnique as jest.MockedFunction<
  typeof db.adminUser.findUnique
>;

describe("logProductEvent", () => {
  beforeEach(() => {
    mockProductEventCreate.mockReset();
    mockAdminUserFindUnique.mockReset();
    mockAdminUserFindUnique.mockResolvedValue({
      isTestAccount: false,
      isTestFixture: false,
    } as never);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("happy path writes expected Prisma payload and success log line", async () => {
    mockProductEventCreate.mockResolvedValueOnce({ id: "pev-row-1" } as never);

    await logProductEvent({
      kind: "TUTOR_SIGNUP",
      adminUserId: "admin-1",
      metadata: { method: "credentials" },
    });

    expect(mockProductEventCreate).toHaveBeenCalledTimes(1);
    const arg = mockProductEventCreate.mock.calls[0][0];
    expect(arg.data.kind).toBe("TUTOR_SIGNUP");
    expect(arg.data.adminUserId).toBe("admin-1");
    expect(arg.data.metadata).toEqual({ method: "credentials" });
    expect(console.log).toHaveBeenCalledWith(
      "[product-events] pev=pev-row-1 kind=TUTOR_SIGNUP admin=admin-1 wbsid=n/a"
    );
  });

  test("does not throw when Prisma rejects", async () => {
    mockProductEventCreate.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      logProductEvent({
        kind: "TUTOR_LOGIN",
        adminUserId: "admin-1",
        metadata: { method: "google", approvalStatus: "WAITLISTED" },
      })
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      "[product-events] pev=FAIL kind=TUTOR_LOGIN error=db unavailable"
    );
  });

  test("skips test accounts without writing a row", async () => {
    mockAdminUserFindUnique.mockResolvedValueOnce({
      isTestAccount: true,
      isTestFixture: false,
    } as never);

    await logProductEvent({
      kind: "TUTOR_LOGIN",
      adminUserId: "test-admin",
      metadata: { method: "credentials", approvalStatus: "APPROVED" },
    });

    expect(mockProductEventCreate).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  test("skips test fixtures without writing a row", async () => {
    mockAdminUserFindUnique.mockResolvedValueOnce({
      isTestAccount: false,
      isTestFixture: true,
    } as never);

    await logProductEvent({
      kind: "SESSION_CREATED",
      adminUserId: "fixture-admin",
      whiteboardSessionId: "wbs-1",
      metadata: { claimed: true },
    });

    expect(mockProductEventCreate).not.toHaveBeenCalled();
  });

  test('skips env-only admin id "admin"', async () => {
    await logProductEvent({
      kind: "TUTOR_LOGIN",
      adminUserId: "admin",
      metadata: { method: "credentials", approvalStatus: "APPROVED" },
    });

    expect(mockAdminUserFindUnique).not.toHaveBeenCalled();
    expect(mockProductEventCreate).not.toHaveBeenCalled();
  });

  test("does not put email in success log line", async () => {
    mockProductEventCreate.mockResolvedValueOnce({ id: "pev-row-2" } as never);

    await logProductEvent({
      kind: "TUTOR_SIGNUP",
      adminUserId: "admin-uuid-only",
      metadata: { method: "google" },
    });

    const logLine = (console.log as jest.Mock).mock.calls[0][0] as string;
    expect(logLine).not.toMatch(/@/);
    expect(logLine).toContain("admin=admin-uuid-only");
  });
});
