-- AlterTable
ALTER TABLE "Student" ADD COLUMN "adminUserId" TEXT;

-- Assign existing students to the first admin account (by creation time), when one exists.
UPDATE "Student"
SET "adminUserId" = (SELECT id FROM "AdminUser" ORDER BY "createdAt" ASC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM "AdminUser");

-- CreateIndex
CREATE INDEX "Student_adminUserId_idx" ON "Student"("adminUserId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
