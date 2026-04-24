/**
 * @jest-environment node
 */

/**
 * Unit coverage for the consent-enforcement contract on
 * `createWhiteboardSession`.
 *
 * The action's job description has TWO security-critical halves:
 *
 *   1. Refuse to create a row when `consentAcknowledged` is missing
 *      / falsy — this is what stops a back/forward bypass or a hand-
 *      crafted POST from creating a session without the tutor having
 *      ticked the modal.
 *
 *   2. Refuse for non-DB-backed admins (legacy env-only login) — the
 *      schema requires an FK to AdminUser so a session minted by an
 *      env-only login would crash with FK violation. Better to fail
 *      fast with a readable message.
 *
 * Both paths are exercised here without the DB / Blob actually being
 * touched: the failures land BEFORE any network call. We mock the
 * full IO surface (db, blob, auth, redirect) so the test runs in
 * any environment, including CI where Postgres is not provisioned.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  redirect: jest.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT to ${url}`);
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(),
}));

const dbCreateMock = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardSession: {
      create: (...args: unknown[]) => dbCreateMock(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const requireStudentScopeMock = jest.fn();
const assertOwnsStudentMock = jest.fn(async (..._args: unknown[]) => {});
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: () => requireStudentScopeMock(),
  assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
}));

import { createWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { put } from "@vercel/blob";
import { redirect } from "next/navigation";

const putMock = put as jest.MockedFunction<typeof put>;
const redirectMock = redirect as jest.MockedFunction<typeof redirect>;

beforeEach(() => {
  putMock.mockReset();
  dbCreateMock.mockReset();
  requireStudentScopeMock.mockReset();
  assertOwnsStudentMock.mockClear();
  redirectMock.mockClear();
});

function fdWith(consent: string | undefined): FormData {
  const fd = new FormData();
  if (consent !== undefined) fd.set("consentAcknowledged", consent);
  return fd;
}

describe("createWhiteboardSession - consent enforcement", () => {
  test("rejects when consentAcknowledged is missing entirely", async () => {
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: "admin-1",
      email: "tutor@example.com",
    });
    await expect(
      createWhiteboardSession("student-1", fdWith(undefined))
    ).rejects.toThrow(/acknowledge.*consent/i);
    expect(putMock).not.toHaveBeenCalled();
    expect(dbCreateMock).not.toHaveBeenCalled();
    expect(requireStudentScopeMock).not.toHaveBeenCalled();
  });

  test("rejects when consentAcknowledged=false is sent (POST tampering)", async () => {
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: "admin-1",
      email: "tutor@example.com",
    });
    await expect(
      createWhiteboardSession("student-1", fdWith("false"))
    ).rejects.toThrow(/acknowledge.*consent/i);
    expect(putMock).not.toHaveBeenCalled();
    expect(dbCreateMock).not.toHaveBeenCalled();
  });

  test("rejects an env-only admin even with consent acknowledged", async () => {
    requireStudentScopeMock.mockResolvedValue({
      kind: "env",
      email: "env-admin@example.com",
    });
    await expect(
      createWhiteboardSession("student-1", fdWith("true"))
    ).rejects.toThrow(/registered admin account/i);
    expect(putMock).not.toHaveBeenCalled();
    expect(dbCreateMock).not.toHaveBeenCalled();
  });

  test("happy path: consent + admin scope produces a row + redirect", async () => {
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: "admin-1",
      email: "tutor@example.com",
    });
    putMock.mockResolvedValue({
      url: "https://blob.example.com/whiteboard-sessions/admin-1/student-1/123-events.json",
      pathname: "x",
      contentType: "application/json",
      contentDisposition: "",
      downloadUrl: "x",
    } as Awaited<ReturnType<typeof put>>);
    dbCreateMock.mockResolvedValue({ id: "wb-session-xyz", studentId: "student-1" });

    await expect(
      createWhiteboardSession("student-1", fdWith("true"))
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(assertOwnsStudentMock).toHaveBeenCalledWith("student-1");
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(dbCreateMock).toHaveBeenCalledTimes(1);
    const createArgs = dbCreateMock.mock.calls[0]?.[0] as {
      data: { consentAcknowledged: boolean; eventsBlobUrl: string; adminUserId: string };
    };
    expect(createArgs.data.consentAcknowledged).toBe(true);
    expect(createArgs.data.adminUserId).toBe("admin-1");
    expect(createArgs.data.eventsBlobUrl).toMatch(/blob\.example\.com/);
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/students/student-1/whiteboard/wb-session-xyz/workspace"
    );
  });

  test("accepts both 'true' and 'on' (browser checkbox default value)", async () => {
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: "admin-1",
      email: "tutor@example.com",
    });
    putMock.mockResolvedValue({
      url: "https://blob.example.com/x.json",
      pathname: "x",
      contentType: "application/json",
      contentDisposition: "",
      downloadUrl: "x",
    } as Awaited<ReturnType<typeof put>>);
    dbCreateMock.mockResolvedValue({ id: "wb-1", studentId: "student-1" });

    await expect(
      createWhiteboardSession("student-1", fdWith("on"))
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(dbCreateMock).toHaveBeenCalledTimes(1);
  });

  test("does not insert a row if Blob put fails", async () => {
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: "admin-1",
      email: "tutor@example.com",
    });
    putMock.mockRejectedValue(new Error("blob storage 500"));

    await expect(
      createWhiteboardSession("student-1", fdWith("true"))
    ).rejects.toThrow(/whiteboard session storage/i);
    expect(dbCreateMock).not.toHaveBeenCalled();
  });
});
