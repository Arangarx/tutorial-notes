-- Add AI generation tracking fields to SessionNote.
-- Additive migration: existing rows get aiGenerated=false and aiPromptVersion=NULL.
ALTER TABLE "SessionNote" ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SessionNote" ADD COLUMN "aiPromptVersion" TEXT;
