-- Migration: 20260513205000_add_practitioner_antifraud_fields
-- Practitioner anti-fraud and payout-hold signals (B219).

ALTER TABLE "practitioners"
  ADD COLUMN "risk_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "risk_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "risk_reviewed_at" TIMESTAMP(3);

ALTER TABLE "bookings"
  ADD COLUMN "ip_hash" TEXT,
  ADD COLUMN "user_agent_hash" TEXT,
  ADD COLUMN "device_hash" TEXT,
  ADD COLUMN "risk_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "risk_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "risk_reviewed_at" TIMESTAMP(3);

ALTER TABLE "reviews"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "risk_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "risk_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "payouts"
  ADD COLUMN "available_at" TIMESTAMP(3),
  ADD COLUMN "hold_reason" TEXT,
  ADD COLUMN "risk_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "risk_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "bookings_ip_hash_created_at_idx" ON "bookings"("ip_hash", "createdAt");
CREATE INDEX "bookings_device_hash_created_at_idx" ON "bookings"("device_hash", "createdAt");
CREATE INDEX "bookings_risk_score_created_at_idx" ON "bookings"("risk_score", "createdAt");
CREATE INDEX "reviews_status_created_at_idx" ON "reviews"("status", "createdAt");
CREATE INDEX "reviews_risk_score_created_at_idx" ON "reviews"("risk_score", "createdAt");
CREATE INDEX "payouts_status_available_at_idx" ON "payouts"("status", "available_at");
CREATE INDEX "payouts_risk_score_created_at_idx" ON "payouts"("risk_score", "createdAt");

-- Active practitioners were already manually published before this
-- verification gate existed; treat current ACTIVE publication as verified.
UPDATE "practitioners"
SET "verified" = TRUE
WHERE "status" = 'ACTIVE' AND "verified" = FALSE;
