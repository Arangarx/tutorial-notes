-- Whiteboard Phase 1: WhiteboardSession + WhiteboardJoinToken tables
-- and a nullable whiteboardSessionId column on SessionRecording so an
-- audio recording can be attached to the live whiteboard session that
-- produced it.
--
-- Additive only: existing rows are unaffected, new columns are
-- nullable or have safe defaults. Idempotent so deploy retries are safe.
--
-- See:
--   - prisma/schema.prisma (canonical model definitions + field comments)
--   - docs/WHITEBOARD-STATUS.md (sub-section 1.1)
--   - ~/.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_*.plan.md

-- =====================================================================
-- WhiteboardSession
-- =====================================================================

CREATE TABLE IF NOT EXISTS "WhiteboardSession" (
    "id"                  TEXT NOT NULL,
    "adminUserId"         TEXT NOT NULL,
    "studentId"           TEXT NOT NULL,
    "noteId"              TEXT,
    "startedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"             TIMESTAMP(3),
    "durationSeconds"     INTEGER,
    "consentAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "eventsBlobUrl"       TEXT NOT NULL,
    "eventsSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "snapshotBlobUrl"     TEXT,
    "bothConnectedAt"     TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhiteboardSession_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WhiteboardSession_adminUserId_fkey'
    ) THEN
        ALTER TABLE "WhiteboardSession"
            ADD CONSTRAINT "WhiteboardSession_adminUserId_fkey"
            FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WhiteboardSession_studentId_fkey'
    ) THEN
        ALTER TABLE "WhiteboardSession"
            ADD CONSTRAINT "WhiteboardSession_studentId_fkey"
            FOREIGN KEY ("studentId") REFERENCES "Student"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WhiteboardSession_noteId_fkey'
    ) THEN
        ALTER TABLE "WhiteboardSession"
            ADD CONSTRAINT "WhiteboardSession_noteId_fkey"
            FOREIGN KEY ("noteId") REFERENCES "SessionNote"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "WhiteboardSession_adminUserId_idx" ON "WhiteboardSession"("adminUserId");
CREATE INDEX IF NOT EXISTS "WhiteboardSession_studentId_idx"   ON "WhiteboardSession"("studentId");
CREATE INDEX IF NOT EXISTS "WhiteboardSession_noteId_idx"      ON "WhiteboardSession"("noteId");

-- =====================================================================
-- WhiteboardJoinToken
-- Tokenized live-room join link for the student. Same trust model as
-- ShareLink: the token is the credential, scoped to one whiteboard
-- session, time-limited (default 30 min), and revocable on Stop.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "WhiteboardJoinToken" (
    "id"                  TEXT NOT NULL,
    "whiteboardSessionId" TEXT NOT NULL,
    "token"               TEXT NOT NULL,
    "expiresAt"           TIMESTAMP(3) NOT NULL,
    "revokedAt"           TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhiteboardJoinToken_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WhiteboardJoinToken_whiteboardSessionId_fkey'
    ) THEN
        ALTER TABLE "WhiteboardJoinToken"
            ADD CONSTRAINT "WhiteboardJoinToken_whiteboardSessionId_fkey"
            FOREIGN KEY ("whiteboardSessionId") REFERENCES "WhiteboardSession"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "WhiteboardJoinToken_token_key"
    ON "WhiteboardJoinToken"("token");
CREATE INDEX IF NOT EXISTS "WhiteboardJoinToken_whiteboardSessionId_idx"
    ON "WhiteboardJoinToken"("whiteboardSessionId");
CREATE INDEX IF NOT EXISTS "WhiteboardJoinToken_token_idx"
    ON "WhiteboardJoinToken"("token");

-- =====================================================================
-- SessionRecording.whiteboardSessionId
-- Nullable so existing audio rows (no whiteboard) keep validating.
-- SetNull because deleting a whiteboard session should not also delete
-- the audio — the recording can still be attached to a regular note.
-- =====================================================================

ALTER TABLE "SessionRecording"
    ADD COLUMN IF NOT EXISTS "whiteboardSessionId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SessionRecording_whiteboardSessionId_fkey'
    ) THEN
        ALTER TABLE "SessionRecording"
            ADD CONSTRAINT "SessionRecording_whiteboardSessionId_fkey"
            FOREIGN KEY ("whiteboardSessionId") REFERENCES "WhiteboardSession"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "SessionRecording_whiteboardSessionId_idx"
    ON "SessionRecording"("whiteboardSessionId");
