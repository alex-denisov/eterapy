ALTER TABLE "referral_attributions"
  ADD COLUMN IF NOT EXISTS "risk_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "risk_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "ip_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "user_agent_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "device_hash" TEXT;

CREATE INDEX IF NOT EXISTS "referral_attributions_ip_hash_created_at_idx" ON "referral_attributions"("ip_hash", "created_at");
CREATE INDEX IF NOT EXISTS "referral_attributions_device_hash_created_at_idx" ON "referral_attributions"("device_hash", "created_at");

CREATE TABLE IF NOT EXISTS "fraud_events" (
  "id" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL,
  "subject_id" TEXT,
  "actor_user_id" TEXT,
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "risk_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'logged',
  "ip_hash" TEXT,
  "user_agent_hash" TEXT,
  "device_hash" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fraud_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fraud_events_subject_type_subject_id_idx" ON "fraud_events"("subject_type", "subject_id");
CREATE INDEX IF NOT EXISTS "fraud_events_actor_user_id_created_at_idx" ON "fraud_events"("actor_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "fraud_events_status_created_at_idx" ON "fraud_events"("status", "created_at");
