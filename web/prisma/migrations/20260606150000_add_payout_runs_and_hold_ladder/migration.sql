-- Y10 Z17: payout hold ladder 14/5/2, chargeback reserve, and idempotent payout runs.

CREATE TABLE "payout_runs" (
  "id" TEXT NOT NULL,
  "scheduled_for" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "initiated_by" TEXT,
  "candidate_count" INTEGER NOT NULL DEFAULT 0,
  "processing_count" INTEGER NOT NULL DEFAULT 0,
  "held_count" INTEGER NOT NULL DEFAULT 0,
  "total_amount_kopecks" INTEGER NOT NULL DEFAULT 0,
  "total_disbursed_kopecks" INTEGER NOT NULL DEFAULT 0,
  "total_reserve_kopecks" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payout_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payout_runs_scheduled_for_key" ON "payout_runs"("scheduled_for");
CREATE INDEX "payout_runs_status_scheduled_for_idx" ON "payout_runs"("status", "scheduled_for");

ALTER TABLE "payouts"
  ADD COLUMN "hold_days" INTEGER,
  ADD COLUMN "plan_key_at_payout" TEXT,
  ADD COLUMN "reserve_kopecks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "payout_run_id" TEXT;

UPDATE "payouts"
SET
  "hold_days" = 7,
  "plan_key_at_payout" = 'legacy'
WHERE "hold_days" IS NULL;

CREATE INDEX "payouts_payout_run_id_idx" ON "payouts"("payout_run_id");

ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_payout_run_id_fkey"
  FOREIGN KEY ("payout_run_id") REFERENCES "payout_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payout_details"
  ADD COLUMN "kyc_status" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "kyc_verified_at" TIMESTAMP(3);

UPDATE "payout_details"
SET "kyc_status" = 'PENDING'
WHERE "type" = 'ENTITY';
