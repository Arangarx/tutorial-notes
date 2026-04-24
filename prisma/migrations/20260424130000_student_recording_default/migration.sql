-- Per-student "Start recording" default for the whiteboard workspace.
-- Sarah's pilot ask (Apr 2026): some students decline recording, so
-- the workspace toggle should remember that and ship Start unticked
-- for those students next time. The tutor can still flip per session.
--
-- Defaults to true so existing students keep behaving exactly as
-- they do today; tutor opts a student out by toggling the new
-- per-student switch on the student detail page.
--
-- See:
--   - prisma/schema.prisma (Student.recordingDefaultEnabled)
--   - src/app/admin/students/[id]/StudentRecordingDefaultToggle.tsx
--   - src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/page.tsx
--     (reads the field and threads it as initialUserWantsRecording)
--
-- Additive + idempotent so re-deploy is safe.

ALTER TABLE "Student"
    ADD COLUMN IF NOT EXISTS "recordingDefaultEnabled" BOOLEAN NOT NULL DEFAULT true;
