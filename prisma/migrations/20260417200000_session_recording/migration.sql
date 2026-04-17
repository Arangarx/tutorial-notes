-- Add SessionRecording table and link it to SessionNote.
-- Additive migration: existing rows are unaffected (new columns are nullable or have defaults).

CREATE TABLE "SessionRecording" (
    "id"              TEXT NOT NULL,
    "adminUserId"     TEXT NOT NULL,
    "studentId"       TEXT NOT NULL,
    "blobUrl"         TEXT NOT NULL,
    "mimeType"        TEXT NOT NULL,
    "sizeBytes"       INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "transcript"      TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionRecording_pkey" PRIMARY KEY ("id")
);

-- FK: recording belongs to a tutor
ALTER TABLE "SessionRecording"
    ADD CONSTRAINT "SessionRecording_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: recording belongs to a student
ALTER TABLE "SessionRecording"
    ADD CONSTRAINT "SessionRecording_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes for ownership queries
CREATE INDEX "SessionRecording_adminUserId_idx" ON "SessionRecording"("adminUserId");
CREATE INDEX "SessionRecording_studentId_idx"   ON "SessionRecording"("studentId");

-- Add recording link + share toggle to SessionNote
ALTER TABLE "SessionNote" ADD COLUMN "recordingId"          TEXT    UNIQUE;
ALTER TABLE "SessionNote" ADD COLUMN "shareRecordingInEmail" BOOLEAN NOT NULL DEFAULT false;

-- FK: note → recording (nullable; SET NULL on recording delete)
ALTER TABLE "SessionNote"
    ADD CONSTRAINT "SessionNote_recordingId_fkey"
    FOREIGN KEY ("recordingId") REFERENCES "SessionRecording"("id") ON DELETE SET NULL ON UPDATE CASCADE;
