-- First-party product funnel events (additive only).

CREATE TYPE "ProductEventKind" AS ENUM (
  'TUTOR_SIGNUP',
  'TUTOR_LOGIN',
  'TUTOR_APPROVED',
  'TUTOR_WAITLIST_BLOCKED',
  'SESSION_CREATED',
  'SESSION_STARTED',
  'SESSION_ENDED'
);

CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL,
    "kind" "ProductEventKind" NOT NULL,
    "adminUserId" TEXT,
    "studentId" TEXT,
    "whiteboardSessionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductEvent_kind_createdAt_idx" ON "ProductEvent"("kind", "createdAt");
CREATE INDEX "ProductEvent_adminUserId_createdAt_idx" ON "ProductEvent"("adminUserId", "createdAt");
CREATE INDEX "ProductEvent_studentId_createdAt_idx" ON "ProductEvent"("studentId", "createdAt");
CREATE INDEX "ProductEvent_createdAt_idx" ON "ProductEvent"("createdAt");
CREATE INDEX "ProductEvent_whiteboardSessionId_createdAt_idx" ON "ProductEvent"("whiteboardSessionId", "createdAt");

ALTER TABLE "ProductEvent" ADD CONSTRAINT "ProductEvent_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductEvent" ADD CONSTRAINT "ProductEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductEvent" ADD CONSTRAINT "ProductEvent_whiteboardSessionId_fkey" FOREIGN KEY ("whiteboardSessionId") REFERENCES "WhiteboardSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
