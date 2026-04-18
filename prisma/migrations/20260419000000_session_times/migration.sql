-- Phase 4: optional session start/end times on SessionNote.
-- Both nullable; auto-filled from recording timestamps when available, tutor-editable.
ALTER TABLE "SessionNote" ADD COLUMN IF NOT EXISTS "startTime" TIMESTAMP(3);
ALTER TABLE "SessionNote" ADD COLUMN IF NOT EXISTS "endTime" TIMESTAMP(3);
