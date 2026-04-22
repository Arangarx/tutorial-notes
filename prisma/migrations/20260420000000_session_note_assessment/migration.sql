-- B4: add `assessment` column to SessionNote so the AI can capture where
-- the student stands on what was covered. Sarah's pilot feedback: she
-- wanted Topics / Homework / Assessment / Plan / Links rather than the
-- previous Topics / Homework / Next steps / Links. We keep the existing
-- `nextSteps` column (re-labelled "Plan" in the UI) for backwards
-- compatibility — no data loss, no rename, just one new column with a
-- safe default so existing rows don't violate NOT NULL.
--
-- Idempotent so deploy retries are safe.

ALTER TABLE "SessionNote" ADD COLUMN IF NOT EXISTS "assessment" TEXT NOT NULL DEFAULT '';
