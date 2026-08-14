/** Calendar integration panel row — real Google state + static placeholders. */
export type CalendarProvider = "google" | "apple" | "other";

export type CalendarConnectionView = {
  provider: CalendarProvider;
  label: string;
  connected: boolean;
  accountLabel?: string;
};

/** Honest sync badge states for scheduled sessions. */
export type CalendarSyncState = "synced" | "pending" | "not-connected";

export type ScheduleStudentOption = {
  id: string;
  name: string;
};

/** Client-facing scheduled session row for schedule views. */
export type ScheduledSessionView = {
  id: string;
  studentId: string;
  studentName: string;
  subject: string;
  /** YYYY-MM-DD for calendar matching and form defaults. */
  date: string;
  startTime: string;
  endTime: string;
  durationLabel: string;
  /** When false, SessionSyncBadge is not rendered (no Google write yet). */
  showSyncBadge: boolean;
  syncState: CalendarSyncState;
  location?: string;
  notes?: string;
  /** Raw HH:MM for edit form round-trip. */
  startTimeInput: string;
  endTimeInput: string;
  plannedDurationMinutes: number;
};
