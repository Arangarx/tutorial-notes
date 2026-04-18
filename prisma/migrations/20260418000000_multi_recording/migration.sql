-- Multi-recording support: flip SessionNote 1:1 recording → 1:N recordings.
--
-- Changes:
--   1. Add noteId + orderIndex to SessionRecording
--   2. Migrate existing 1:1 data (SessionNote.recordingId → SessionRecording.noteId)
--   3. Add FK constraint on SessionRecording.noteId
--   4. Drop SessionNote.recordingId (FK constraint + unique index + column)
--
-- All DDL uses IF [NOT] EXISTS guards so the migration is safe to replay
-- against a DB that was partially migrated (e.g. a failed deploy retry).

-- 1. Add new columns to SessionRecording
ALTER TABLE "SessionRecording" ADD COLUMN IF NOT EXISTS "noteId" TEXT;
ALTER TABLE "SessionRecording" ADD COLUMN IF NOT EXISTS "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- 2. Migrate existing 1:1 data
--    Find every SessionNote that had a recordingId, set that recording's noteId = note.id.
--    The IF EXISTS guard protects against running this after the column is already dropped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SessionNote' AND column_name = 'recordingId'
  ) THEN
    UPDATE "SessionRecording" sr
    SET "noteId" = sn."id"
    FROM "SessionNote" sn
    WHERE sn."recordingId" = sr."id"
      AND sr."noteId" IS NULL;
  END IF;
END $$;

-- 3. Add FK constraint (skip if already present — idempotent replays)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionRecording_noteId_fkey'
  ) THEN
    ALTER TABLE "SessionRecording"
      ADD CONSTRAINT "SessionRecording_noteId_fkey"
      FOREIGN KEY ("noteId") REFERENCES "SessionNote"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Add index on noteId (skip if already present)
CREATE INDEX IF NOT EXISTS "SessionRecording_noteId_idx" ON "SessionRecording"("noteId");

-- 6. Drop old FK constraint from SessionNote.recordingId
ALTER TABLE "SessionNote" DROP CONSTRAINT IF EXISTS "SessionNote_recordingId_fkey";

-- 7. Drop the unique constraint on SessionNote.recordingId
--    (this also drops the backing index — use DROP CONSTRAINT, not DROP INDEX directly,
--     because PostgreSQL forbids dropping an index that backs a named constraint)
ALTER TABLE "SessionNote" DROP CONSTRAINT IF EXISTS "SessionNote_recordingId_key";

-- 8. Drop the column itself
ALTER TABLE "SessionNote" DROP COLUMN IF EXISTS "recordingId";
