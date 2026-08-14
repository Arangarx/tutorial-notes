"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { parseDateOnlyInput } from "@/lib/date-only";
import { db, withDbRetry } from "@/lib/db";
import { toScheduledSessionView } from "@/lib/schedule/scheduled-session-mapper";
import type { ScheduleStudentOption, ScheduledSessionView } from "@/lib/schedule/types";
import {
  assertOwnsStudent,
  requireStudentScope,
  studentsWhereForScope,
} from "@/lib/student-scope";

export type ScheduledSessionInput = {
  studentId: string;
  date: string;
  startTime: string;
  endTime: string;
  plannedDurationMinutes: number;
  subject: string;
  notes?: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseScheduledSessionInput(input: ScheduledSessionInput) {
  const date = parseDateOnlyInput(input.date);
  if (!date) return null;
  const subject = input.subject.trim();
  if (!subject) return null;
  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) return null;
  const plannedDurationMinutes = Number(input.plannedDurationMinutes);
  if (![45, 60, 90].includes(plannedDurationMinutes)) return null;
  return {
    date,
    subject,
    startTime: input.startTime,
    endTime: input.endTime,
    plannedDurationMinutes,
    notes: input.notes?.trim() ?? "",
  };
}

async function requireAdminScope() {
  const scope = await requireStudentScope();
  if (scope.kind !== "admin") notFound();
  return scope;
}

async function assertOwnsScheduledSession(sessionId: string) {
  const scope = await requireAdminScope();
  const session = await withDbRetry(
    () =>
      db.scheduledSession.findUnique({
        where: { id: sessionId },
        select: { adminUserId: true, studentId: true },
      }),
    { label: "assertOwnsScheduledSession" }
  );
  if (!session || session.adminUserId !== scope.adminId) notFound();
  await assertOwnsStudent(session.studentId);
  return session;
}

/** Lists sessions for the authenticated tutor only (`adminUserId` = scope.adminId). */
export async function listScheduledSessionsForTutor(
  googleConnected: boolean
): Promise<ScheduledSessionView[]> {
  const scope = await requireAdminScope();
  const rows = await withDbRetry(
    () =>
      db.scheduledSession.findMany({
        where: { adminUserId: scope.adminId },
        include: { student: { select: { name: true } } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    { label: "listScheduledSessionsForTutor" }
  );
  return rows.map((row) => toScheduledSessionView(row, googleConnected));
}

export async function listScheduleStudentOptions(): Promise<ScheduleStudentOption[]> {
  const scope = await requireStudentScope();
  return withDbRetry(
    () =>
      db.student.findMany({
        where: studentsWhereForScope(scope),
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    { label: "listScheduleStudentOptions" }
  );
}

export async function createScheduledSession(
  input: ScheduledSessionInput
): Promise<{ id: string }> {
  const scope = await requireAdminScope();
  await assertOwnsStudent(input.studentId);
  const parsed = parseScheduledSessionInput(input);
  if (!parsed) notFound();

  const row = await withDbRetry(
    () =>
      db.scheduledSession.create({
        data: {
          adminUserId: scope.adminId,
          studentId: input.studentId,
          ...parsed,
        },
      }),
    { label: "createScheduledSession" }
  );

  revalidatePath("/admin/schedule");
  return { id: row.id };
}

export async function updateScheduledSession(
  sessionId: string,
  input: ScheduledSessionInput
): Promise<void> {
  await assertOwnsScheduledSession(sessionId);
  await assertOwnsStudent(input.studentId);
  const parsed = parseScheduledSessionInput(input);
  if (!parsed) notFound();

  await withDbRetry(
    () =>
      db.scheduledSession.update({
        where: { id: sessionId },
        data: {
          studentId: input.studentId,
          ...parsed,
        },
      }),
    { label: "updateScheduledSession" }
  );

  revalidatePath("/admin/schedule");
}

export async function deleteScheduledSession(sessionId: string): Promise<void> {
  await assertOwnsScheduledSession(sessionId);
  await withDbRetry(
    () => db.scheduledSession.delete({ where: { id: sessionId } }),
    { label: "deleteScheduledSession" }
  );
  revalidatePath("/admin/schedule");
}
