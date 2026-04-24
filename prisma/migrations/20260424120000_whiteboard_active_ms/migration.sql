-- Whiteboard Wyzant-style timer: persist accumulated "both connected"
-- time on WhiteboardSession so a student drop / tutor refresh / network
-- blip never bills time the parties weren't actually together.
--
-- See:
--   - prisma/schema.prisma (canonical model + field comments)
--   - src/app/api/whiteboard/[sessionId]/active-ping/route.ts (writer)
--   - src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx
--     (heartbeat loop + display math)
--
-- Additive only: new columns are nullable or have safe defaults so
-- existing in-flight sessions keep working without backfill. Idempotent
-- so deploy retries are safe.

ALTER TABLE "WhiteboardSession"
    ADD COLUMN IF NOT EXISTS "activeMs"     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);
