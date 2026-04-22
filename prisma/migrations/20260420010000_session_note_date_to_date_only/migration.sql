-- Convert SessionNote.date from `timestamp` to `date` so the tutor's typed
-- calendar day round-trips losslessly regardless of viewer timezone.
--
-- The `USING (date AT TIME ZONE 'UTC')::date` clause is the important bit:
-- existing rows were stored as UTC midnight of the day the tutor typed
-- (because the prior bug used `new Date("YYYY-MM-DD")`). Casting via UTC
-- preserves that day. A naive `::date` cast would use the session timezone
-- and could shift the value backward one day for sessions running west of
-- UTC (e.g. a server in EDT would turn `2026-04-22T00:00:00Z` into
-- `2026-04-21`).
ALTER TABLE "SessionNote"
  ALTER COLUMN "date" TYPE DATE USING ("date" AT TIME ZONE 'UTC')::date;
