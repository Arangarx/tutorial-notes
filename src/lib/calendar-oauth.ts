import { db } from "@/lib/db";
import type { CalendarConnectionView } from "@/lib/schedule/types";

export type GoogleCalendarConnection = {
  refreshToken: string;
  email: string;
  calendarCount: number | null;
};

function hasOAuthCalendarConnectionModel(): boolean {
  return typeof (db as { oAuthCalendarConnection?: { findFirst: unknown } }).oAuthCalendarConnection
    ?.findFirst === "function";
}

/** Per-tutor Google Calendar OAuth row, or null if table missing / no row. */
export async function getGoogleCalendarConnectionForTutor(
  adminUserId: string | null
): Promise<GoogleCalendarConnection | null> {
  if (!hasOAuthCalendarConnectionModel()) return null;
  try {
    const row = await db.oAuthCalendarConnection.findFirst({
      where: { provider: "google", adminUserId },
    });
    return row
      ? {
          refreshToken: row.refreshToken,
          email: row.email,
          calendarCount: row.calendarCount,
        }
      : null;
  } catch {
    return null;
  }
}

/** Panel rows: real Google state + static Apple/other placeholders. */
export function buildCalendarPanelConnections(
  googleConnection: Pick<GoogleCalendarConnection, "email"> | null
): CalendarConnectionView[] {
  return [
    {
      provider: "google",
      label: "Google Calendar",
      connected: !!googleConnection,
      accountLabel: googleConnection?.email,
    },
    {
      provider: "apple",
      label: "Apple Calendar",
      connected: false,
    },
    {
      provider: "other",
      label: "Other calendar",
      connected: false,
    },
  ];
}
