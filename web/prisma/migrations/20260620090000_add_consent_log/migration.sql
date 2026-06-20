-- CreateEnum
CREATE TYPE "ConsentCheckboxType" AS ENUM ('CONTRACT', 'PDN');

-- CreateTable
CREATE TABLE "consent_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkboxType" "ConsentCheckboxType" NOT NULL,
    "documentVersions" JSONB NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_logs_userId_idx" ON "consent_logs"("userId");

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
