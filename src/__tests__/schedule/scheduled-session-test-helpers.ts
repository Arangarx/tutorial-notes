import { formatDateOnlyInput } from "@/lib/date-only";
import { db, withDbRetry } from "@/lib/db";

/** Test oracle: read back stored DATE as YYYY-MM-DD without going through server actions. */
export async function getScheduledSessionDateInputForTest(
  sessionId: string
): Promise<string | null> {
  const row = await withDbRetry(
    () =>
      db.scheduledSession.findUnique({
        where: { id: sessionId },
        select: { date: true },
      }),
    { label: "getScheduledSessionDateInputForTest" }
  );
  return row ? formatDateOnlyInput(row.date) : null;
}
