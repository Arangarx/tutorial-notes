import type { ScheduledSession, Student } from "@prisma/client";
import { formatDateOnlyInput } from "@/lib/date-only";
import type { CalendarSyncState, ScheduledSessionView } from "@/lib/schedule/types";
import { durationLabelForMinutes, formatTimeDisplay } from "@/lib/schedule/time-format";

type ScheduledSessionRow = ScheduledSession & {
  student: Pick<Student, "name">;
};

function resolveSyncPresentation(
  googleConnected: boolean,
  googleEventId: string | null
): Pick<ScheduledSessionView, "showSyncBadge" | "syncState"> {
  if (googleEventId) {
    return { showSyncBadge: true, syncState: "synced" };
  }
  if (googleConnected) {
    return { showSyncBadge: true, syncState: "not-connected" };
  }
  return { showSyncBadge: false, syncState: "not-connected" };
}

export function toScheduledSessionView(
  row: ScheduledSessionRow,
  googleConnected: boolean
): ScheduledSessionView {
  const sync = resolveSyncPresentation(googleConnected, row.googleEventId);
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.name,
    subject: row.subject,
    date: formatDateOnlyInput(row.date),
    startTime: formatTimeDisplay(row.startTime),
    endTime: formatTimeDisplay(row.endTime),
    startTimeInput: row.startTime,
    endTimeInput: row.endTime,
    plannedDurationMinutes: row.plannedDurationMinutes,
    durationLabel: durationLabelForMinutes(row.plannedDurationMinutes),
    showSyncBadge: sync.showSyncBadge,
    syncState: sync.syncState as CalendarSyncState,
    location: row.location || undefined,
    notes: row.notes || undefined,
  };
}
