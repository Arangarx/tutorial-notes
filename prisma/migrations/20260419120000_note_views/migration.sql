-- Phase 5: NoteView — tracks which notes a share-link visitor has seen.
-- shareToken is stored as a plain string (not FK) so old view records survive link regeneration.
-- noteId FK cascades on note delete so orphaned views are cleaned up automatically.
CREATE TABLE IF NOT EXISTS "NoteView" (
    "id"         TEXT        NOT NULL,
    "shareToken" TEXT        NOT NULL,
    "noteId"     TEXT        NOT NULL,
    "seenAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteView_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NoteView_noteId_fkey'
  ) THEN
    ALTER TABLE "NoteView"
      ADD CONSTRAINT "NoteView_noteId_fkey"
      FOREIGN KEY ("noteId") REFERENCES "SessionNote"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "NoteView_shareToken_noteId_key" ON "NoteView"("shareToken", "noteId");
CREATE INDEX IF NOT EXISTS "NoteView_shareToken_idx" ON "NoteView"("shareToken");
