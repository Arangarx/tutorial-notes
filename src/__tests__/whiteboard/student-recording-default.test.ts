/**
 * @jest-environment node
 */

/**
 * Server-action contract for `setStudentRecordingDefault`.
 *
 * Sarah's pilot ask (Apr 2026): some students decline being recorded,
 * so the workspace toggle's initial state should remember that per
 * student. The action backing the per-student switch on the student
 * detail page is the source of truth — these tests pin the contract:
 *
 *   1. Multi-tenant gate: the action MUST `assertOwnsStudent` BEFORE
 *      writing. A regression that flipped the order would let any
 *      logged-in admin toggle defaults on students they don't own.
 *
 *   2. Idempotent + boolean — `enabled=true` writes `true`, `false`
 *      writes `false`. We also confirm the action passes the value
 *      through verbatim (no coercion via truthy fallback).
 *
 *   3. Revalidates the student detail page so the toggle's `(on)` /
 *      `(off)` indicator and the BACKLOG-tracked "next session" text
 *      reflect the change without a hard reload.
 *
 * IO is fully mocked so the test runs without Postgres provisioned.
 */

const dbUpdateMock = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    student: {
      update: (...args: unknown[]) => dbUpdateMock(...args),
    },
  },
}));

const assertOwnsStudentMock = jest.fn(async (_id: string) => {});
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
}));

const revalidatePathMock = jest.fn();
jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

import { setStudentRecordingDefault } from "@/app/admin/students/[id]/actions";

beforeEach(() => {
  dbUpdateMock.mockReset();
  assertOwnsStudentMock.mockReset();
  assertOwnsStudentMock.mockResolvedValue(undefined);
  revalidatePathMock.mockReset();
});

describe("setStudentRecordingDefault", () => {
  it("calls assertOwnsStudent BEFORE writing (multi-tenant gate is first)", async () => {
    const order: string[] = [];
    assertOwnsStudentMock.mockImplementation(async (_id: string) => {
      order.push("assert");
    });
    dbUpdateMock.mockImplementation(async () => {
      order.push("update");
      return {};
    });

    await setStudentRecordingDefault("stu_42", true);

    expect(order).toEqual(["assert", "update"]);
    expect(assertOwnsStudentMock).toHaveBeenCalledWith("stu_42");
  });

  it("does NOT write if assertOwnsStudent rejects", async () => {
    assertOwnsStudentMock.mockRejectedValueOnce(new Error("not yours"));

    await expect(
      setStudentRecordingDefault("stu_xx", false)
    ).rejects.toThrow(/not yours/);

    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("writes recordingDefaultEnabled=true verbatim", async () => {
    dbUpdateMock.mockResolvedValueOnce({});

    await setStudentRecordingDefault("stu_a", true);

    expect(dbUpdateMock).toHaveBeenCalledWith({
      where: { id: "stu_a" },
      data: { recordingDefaultEnabled: true },
    });
  });

  it("writes recordingDefaultEnabled=false verbatim (no truthy coercion)", async () => {
    dbUpdateMock.mockResolvedValueOnce({});

    await setStudentRecordingDefault("stu_b", false);

    expect(dbUpdateMock).toHaveBeenCalledWith({
      where: { id: "stu_b" },
      data: { recordingDefaultEnabled: false },
    });
  });

  it("revalidates the student detail page so the toggle re-reads server-truth", async () => {
    dbUpdateMock.mockResolvedValueOnce({});

    await setStudentRecordingDefault("stu_c", true);

    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/students/stu_c");
  });
});
