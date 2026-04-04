-- ComplaintReason enum
CREATE TYPE "ComplaintReason" AS ENUM (
  'PRACTITIONER_NO_SHOW','ETHICAL_VIOLATION','MANIPULATION',
  'TECHNICAL_ISSUE','EARLY_TERMINATION','PAYMENT_ISSUE','OTHER'
);

-- Complaints
CREATE TABLE "complaints" (
  "id"          TEXT NOT NULL,
  "bookingId"   TEXT NOT NULL,
  "reportedBy"  TEXT NOT NULL,
  "reason"      "ComplaintReason" NOT NULL,
  "description" TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'OPEN',
  "resolution"  TEXT,
  "resolvedBy"  TEXT,
  "resolvedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "complaints_bookingId_idx"    ON "complaints"("bookingId");
CREATE INDEX "complaints_status_createdAt" ON "complaints"("status","createdAt");
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_reportedBy_fkey"
  FOREIGN KEY ("reportedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AISessionLog
CREATE TABLE "ai_session_logs" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "tool"      "ToolType" NOT NULL,
  "title"     TEXT NOT NULL,
  "prompt"    TEXT,
  "result"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_session_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_session_logs_userId_createdAt" ON "ai_session_logs"("userId","createdAt");
ALTER TABLE "ai_session_logs" ADD CONSTRAINT "ai_session_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extended profile fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthDate"     TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthTime"     TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthPlace"    TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "occupation"    TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aiGoals"       TEXT[] NOT NULL DEFAULT '{}';
