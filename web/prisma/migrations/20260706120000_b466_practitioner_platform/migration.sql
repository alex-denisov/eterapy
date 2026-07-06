-- B466 practitioner platform (M29): «Practice cockpit» redesign backing models.
-- B483: Practitioner.inn (ИНН вводится/проверяется на «Налоговый статус»).
-- B434: AI-разбор metering ledger (included/topup) + top-up packs.
-- B478: one-way practitioner→client message artifact (ОРИ-safe, no thread).
-- B480: practitioner-proposed booking. B481/B484: reschedule/cancel requests +
-- cancelled_by/cancelled_at/cancel_reason on bookings. План сопровождения (CRM).

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationEvent" ADD VALUE 'PRACTITIONER_MESSAGE';
ALTER TYPE "NotificationEvent" ADD VALUE 'BOOKING_PROPOSED';
ALTER TYPE "NotificationEvent" ADD VALUE 'BOOKING_CHANGE_REQUESTED';
ALTER TYPE "NotificationEvent" ADD VALUE 'BOOKING_CHANGE_RESOLVED';

-- AlterTable
ALTER TABLE "practitioners" ADD COLUMN     "ai_auto_analyze" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inn" TEXT;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "ai_analysis_enabled" BOOLEAN,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by" TEXT;

-- CreateTable
CREATE TABLE "practitioner_ai_analyses" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "video_session_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'included',
    "period_key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practitioner_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioner_ai_topups" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "amount_kopecks" INTEGER NOT NULL,
    "transaction_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practitioner_ai_topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioner_client_messages" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "booking_id" TEXT,
    "text" TEXT NOT NULL,
    "attachment_url" TEXT,
    "attachment_name" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "practitioner_client_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_care_plans" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "goals" JSONB NOT NULL DEFAULT '[]',
    "methods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "next_focus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_suggestion" JSONB,
    "ai_suggested_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_proposals" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "price_rub" INTEGER NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "booking_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "booking_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_change_requests" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "initiated_by" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "proposed_start_at" TIMESTAMP(3),
    "proposed_duration_min" INTEGER,
    "reason" TEXT,
    "penalty_applies" BOOLEAN NOT NULL DEFAULT false,
    "penalty_waived" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "booking_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "practitioner_ai_analyses_video_session_id_key" ON "practitioner_ai_analyses"("video_session_id");

-- CreateIndex
CREATE INDEX "practitioner_ai_analyses_practitionerId_period_key_idx" ON "practitioner_ai_analyses"("practitionerId", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "practitioner_ai_topups_transaction_id_key" ON "practitioner_ai_topups"("transaction_id");

-- CreateIndex
CREATE INDEX "practitioner_ai_topups_practitionerId_createdAt_idx" ON "practitioner_ai_topups"("practitionerId", "createdAt");

-- CreateIndex
CREATE INDEX "practitioner_client_messages_practitionerId_clientId_sent_a_idx" ON "practitioner_client_messages"("practitionerId", "clientId", "sent_at");

-- CreateIndex
CREATE INDEX "practitioner_client_messages_clientId_read_at_idx" ON "practitioner_client_messages"("clientId", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_care_plans_practitionerId_clientId_key" ON "client_care_plans"("practitionerId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_proposals_booking_id_key" ON "booking_proposals"("booking_id");

-- CreateIndex
CREATE INDEX "booking_proposals_practitionerId_status_idx" ON "booking_proposals"("practitionerId", "status");

-- CreateIndex
CREATE INDEX "booking_proposals_clientId_status_createdAt_idx" ON "booking_proposals"("clientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "booking_change_requests_booking_id_status_idx" ON "booking_change_requests"("booking_id", "status");

-- CreateIndex
CREATE INDEX "booking_change_requests_status_createdAt_idx" ON "booking_change_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "practitioner_ai_analyses" ADD CONSTRAINT "practitioner_ai_analyses_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_ai_topups" ADD CONSTRAINT "practitioner_ai_topups_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_client_messages" ADD CONSTRAINT "practitioner_client_messages_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_client_messages" ADD CONSTRAINT "practitioner_client_messages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_care_plans" ADD CONSTRAINT "client_care_plans_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_care_plans" ADD CONSTRAINT "client_care_plans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_proposals" ADD CONSTRAINT "booking_proposals_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_proposals" ADD CONSTRAINT "booking_proposals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_change_requests" ADD CONSTRAINT "booking_change_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

