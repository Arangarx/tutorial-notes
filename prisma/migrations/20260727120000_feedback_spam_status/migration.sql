-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('INBOX', 'SPAM');

-- AlterTable
ALTER TABLE "FeedbackItem" ADD COLUMN "status" "FeedbackStatus" NOT NULL DEFAULT 'INBOX';
ALTER TABLE "FeedbackItem" ADD COLUMN "spamReason" TEXT;
ALTER TABLE "FeedbackItem" ADD COLUMN "submitterIp" TEXT;

-- CreateIndex
CREATE INDEX "FeedbackItem_status_createdAt_idx" ON "FeedbackItem"("status", "createdAt");
