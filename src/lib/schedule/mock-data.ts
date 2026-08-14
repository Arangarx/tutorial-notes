import type { CalendarConnectionView, ScheduledSessionView } from "@/lib/schedule/types";

export type { CalendarConnectionView, CalendarSyncState, ScheduledSessionView, ScheduleStudentOption } from "@/lib/schedule/types";

/** @deprecated Use CalendarConnectionView */
export type MockCalendarConnection = CalendarConnectionView;

/** @deprecated Use ScheduledSessionView */
export type MockScheduledSession = ScheduledSessionView;

/** Local calendar day as YYYY-MM-DD (matches `<input type="date">` and tutor-visible day). */
export function localDateToInputValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function todayLocalDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function sessionsOnDate(
  sessions: ScheduledSessionView[],
  date: Date
): ScheduledSessionView[] {
  const key = localDateToInputValue(date);
  return sessions.filter((s) => s.date === key);
}

export function parseSessionDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function datesWithSessions(sessions: ScheduledSessionView[]): Date[] {
  return sessions.map((s) => parseSessionDate(s.date));
}
