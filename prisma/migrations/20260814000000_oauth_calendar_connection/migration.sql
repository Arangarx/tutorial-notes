-- CreateTable
CREATE TABLE "OAuthCalendarConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "calendarCount" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adminUserId" TEXT,

    CONSTRAINT "OAuthCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OAuthCalendarConnection_adminUserId_idx" ON "OAuthCalendarConnection"("adminUserId");

-- AddForeignKey
ALTER TABLE "OAuthCalendarConnection" ADD CONSTRAINT "OAuthCalendarConnection_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
