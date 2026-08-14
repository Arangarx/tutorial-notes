/**
 * @jest-environment node
 *
 * Native scheduled-session CRUD (Priority #5 chunk 1).
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
}));

const requireStudentScopeMock = jest.fn();
const assertOwnsStudentMock = jest.fn(async (_studentId: string) => undefined);

jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: () => requireStudentScopeMock(),
  assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
  studentsWhereForScope: (scope: { kind: string; adminId?: string }) =>
    scope.kind === "admin" ? { adminUserId: scope.adminId } : { adminUserId: null },
}));

import { db } from "@/lib/db";
import {
  createScheduledSession,
  deleteScheduledSession,
  getScheduledSessionDateInput,
  listScheduledSessionsForTutor,
  updateScheduledSession,
} from "@/app/admin/schedule/actions";
import { formatDateOnlyInput } from "@/lib/date-only";
import { uniq } from "../helpers/unique-test-token";

async function createTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("schedule-tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function createStudentForTutor(adminUserId: string, name = "Schedule Test Student") {
  return db.student.create({
    data: { name, adminUserId, parentEmail: `${uniq("parent")}@example.com` },
  });
}

describe("scheduled session actions", () => {
  afterEach(async () => {
    requireStudentScopeMock.mockReset();
    assertOwnsStudentMock.mockReset();
    assertOwnsStudentMock.mockResolvedValue(undefined);
  });

  it("creates, lists, updates, and deletes a session for the owning tutor", async () => {
    const tutor = await createTutor();
    const student = await createStudentForTutor(tutor.id);
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor.id,
      email: tutor.email,
    });

    const { id } = await createScheduledSession({
      studentId: student.id,
      date: "2026-08-20",
      startTime: "16:00",
      endTime: "17:00",
      plannedDurationMinutes: 60,
      subject: "Algebra II",
      notes: "Chapter 7 review",
    });

    expect(assertOwnsStudentMock).toHaveBeenCalledWith(student.id);

    const listed = await listScheduledSessionsForTutor(false);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id,
      studentId: student.id,
      studentName: student.name,
      subject: "Algebra II",
      date: "2026-08-20",
      showSyncBadge: false,
      syncState: "not-connected",
    });
    expect(listed[0].notes).toBe("Chapter 7 review");

    await updateScheduledSession(id, {
      studentId: student.id,
      date: "2026-08-21",
      startTime: "10:30",
      endTime: "11:30",
      plannedDurationMinutes: 60,
      subject: "SAT Math",
      notes: "Practice set B",
    });

    const updated = await listScheduledSessionsForTutor(false);
    expect(updated[0]).toMatchObject({
      id,
      subject: "SAT Math",
      date: "2026-08-21",
    });

    await deleteScheduledSession(id);
    const afterDelete = await listScheduledSessionsForTutor(false);
    expect(afterDelete).toHaveLength(0);
  });

  it("round-trips date-only input through Postgres DATE", async () => {
    const tutor = await createTutor();
    const student = await createStudentForTutor(tutor.id);
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor.id,
      email: tutor.email,
    });

    const { id } = await createScheduledSession({
      studentId: student.id,
      date: "2026-04-22",
      startTime: "09:00",
      endTime: "10:00",
      plannedDurationMinutes: 60,
      subject: "Chemistry",
    });

    const stored = await getScheduledSessionDateInput(id);
    expect(stored).toBe("2026-04-22");

    const row = await db.scheduledSession.findUnique({ where: { id }, select: { date: true } });
    expect(formatDateOnlyInput(row!.date)).toBe("2026-04-22");
  });

  it("denies another tutor from updating or deleting a session", async () => {
    const tutor1 = await createTutor();
    const tutor2 = await createTutor();
    const student = await createStudentForTutor(tutor1.id);

    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor1.id,
      email: tutor1.email,
    });

    const { id } = await createScheduledSession({
      studentId: student.id,
      date: "2026-08-25",
      startTime: "14:00",
      endTime: "15:00",
      plannedDurationMinutes: 60,
      subject: "Physics",
    });

    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor2.id,
      email: tutor2.email,
    });

    await expect(
      updateScheduledSession(id, {
        studentId: student.id,
        date: "2026-08-25",
        startTime: "14:00",
        endTime: "15:00",
        plannedDurationMinutes: 60,
        subject: "Hacked",
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    await expect(deleteScheduledSession(id)).rejects.toThrow("NEXT_NOT_FOUND");

    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor1.id,
      email: tutor1.email,
    });
    const stillThere = await listScheduledSessionsForTutor(false);
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0].subject).toBe("Physics");

    await deleteScheduledSession(id);
  });

  it("shows honest not-synced badge only when Google is connected", async () => {
    const tutor = await createTutor();
    const student = await createStudentForTutor(tutor.id);
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor.id,
      email: tutor.email,
    });

    await createScheduledSession({
      studentId: student.id,
      date: "2026-08-26",
      startTime: "12:00",
      endTime: "13:00",
      plannedDurationMinutes: 60,
      subject: "Reading",
    });

    const withoutGoogle = await listScheduledSessionsForTutor(false);
    expect(withoutGoogle[0].showSyncBadge).toBe(false);

    const withGoogle = await listScheduledSessionsForTutor(true);
    expect(withGoogle[0].showSyncBadge).toBe(true);
    expect(withGoogle[0].syncState).toBe("not-connected");
  });
});
