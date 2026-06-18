-- B426: agent offer acceptance, practitioner tax-status gate, agent reports.

CREATE TYPE "PractitionerTaxStatus" AS ENUM ('UNKNOWN', 'SELF_EMPLOYED', 'INDIVIDUAL_ENTREPRENEUR', 'LEGAL_ENTITY');

CREATE TYPE "PractitionerTaxReviewStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

CREATE TYPE "AgentReportStatus" AS ENUM ('ISSUED', 'ACCEPTED', 'OBJECTED');

ALTER TABLE "practitioners"
  ADD COLUMN "agent_offer_accepted_at" TIMESTAMP(3),
  ADD COLUMN "agent_offer_version" TEXT,
  ADD COLUMN "tax_status" "PractitionerTaxStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "tax_review_status" "PractitionerTaxReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "tax_status_verified_at" TIMESTAMP(3),
  ADD COLUMN "tax_status_rejected_reason" TEXT;

CREATE TABLE "agent_reports" (
  "id" TEXT NOT NULL,
  "practitioner_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "status" "AgentReportStatus" NOT NULL DEFAULT 'ISSUED',
  "session_count" INTEGER NOT NULL DEFAULT 0,
  "gross_kopecks" INTEGER NOT NULL DEFAULT 0,
  "commission_kopecks" INTEGER NOT NULL DEFAULT 0,
  "refund_kopecks" INTEGER NOT NULL DEFAULT 0,
  "dispute_count" INTEGER NOT NULL DEFAULT 0,
  "held_kopecks" INTEGER NOT NULL DEFAULT 0,
  "payout_due_kopecks" INTEGER NOT NULL DEFAULT 0,
  "payout_status" TEXT NOT NULL DEFAULT 'PENDING',
  "auto_accept_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "objected_at" TIMESTAMP(3),
  "objection_reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_reports_practitioner_id_period_start_period_end_key"
  ON "agent_reports"("practitioner_id", "period_start", "period_end");

CREATE INDEX "agent_reports_status_auto_accept_at_idx"
  ON "agent_reports"("status", "auto_accept_at");

CREATE INDEX "agent_reports_practitioner_id_period_end_idx"
  ON "agent_reports"("practitioner_id", "period_end");

ALTER TABLE "agent_reports"
  ADD CONSTRAINT "agent_reports_practitioner_id_fkey"
  FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
