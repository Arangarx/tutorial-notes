-- B1 leftover: add REJECTED to TutorApprovalStatus (additive only)
ALTER TYPE "TutorApprovalStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
