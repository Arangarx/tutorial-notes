-- AlterTable: add per-tutor scoping to EmailMessage
ALTER TABLE "EmailMessage" ADD COLUMN "adminUserId" TEXT;
CREATE INDEX "EmailMessage_adminUserId_idx" ON "EmailMessage"("adminUserId");
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add per-tutor scoping to EmailConfig
ALTER TABLE "EmailConfig" ADD COLUMN "adminUserId" TEXT;
CREATE INDEX "EmailConfig_adminUserId_idx" ON "EmailConfig"("adminUserId");
ALTER TABLE "EmailConfig" ADD CONSTRAINT "EmailConfig_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add per-tutor scoping to OAuthEmailConnection
ALTER TABLE "OAuthEmailConnection" ADD COLUMN "adminUserId" TEXT;
CREATE INDEX "OAuthEmailConnection_adminUserId_idx" ON "OAuthEmailConnection"("adminUserId");
ALTER TABLE "OAuthEmailConnection" ADD CONSTRAINT "OAuthEmailConnection_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
