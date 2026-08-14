-- Email OTP 2FA chunk 1 — additive only.
-- Adds TwoFactorMethod, nullable totpSecretEnc, email challenge table.

CREATE TYPE "TwoFactorMethod" AS ENUM ('EMAIL_OTP', 'TOTP');

CREATE TYPE "AdminUser2FAEmailChallengePurpose" AS ENUM ('ENROLL', 'LOGIN');

ALTER TABLE "AdminUser2FA"
  ADD COLUMN "method" "TwoFactorMethod" NOT NULL DEFAULT 'TOTP';

ALTER TABLE "AdminUser2FA"
  ALTER COLUMN "totpSecretEnc" DROP NOT NULL;

ALTER TABLE "AdminUser2FA"
  ALTER COLUMN "enrolledAt" DROP NOT NULL,
  ALTER COLUMN "enrolledAt" DROP DEFAULT;

-- Existing confirmed TOTP rows already have enrolledAt from prior default(now()).
UPDATE "AdminUser2FA"
SET "enrolledAt" = COALESCE("enrolledAt", NOW())
WHERE "totpSecretEnc" IS NOT NULL;

CREATE TABLE "AdminUser2FAEmailChallenge" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "twoFaId" TEXT,
  "codeHash" TEXT NOT NULL,
  "purpose" "AdminUser2FAEmailChallengePurpose" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminUser2FAEmailChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminUser2FAEmailChallenge_adminUserId_purpose_idx"
  ON "AdminUser2FAEmailChallenge"("adminUserId", "purpose");

CREATE INDEX "AdminUser2FAEmailChallenge_twoFaId_idx"
  ON "AdminUser2FAEmailChallenge"("twoFaId");

ALTER TABLE "AdminUser2FAEmailChallenge"
  ADD CONSTRAINT "AdminUser2FAEmailChallenge_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminUser2FAEmailChallenge"
  ADD CONSTRAINT "AdminUser2FAEmailChallenge_twoFaId_fkey"
  FOREIGN KEY ("twoFaId") REFERENCES "AdminUser2FA"("id") ON DELETE CASCADE ON UPDATE CASCADE;
