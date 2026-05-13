ALTER TABLE "clarity_circles"
  ADD COLUMN IF NOT EXISTS "creator_ip_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "creator_user_agent_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "creator_device_hash" TEXT;

ALTER TABLE "clarity_circle_participants"
  ADD COLUMN IF NOT EXISTS "ip_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "user_agent_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "device_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "answer_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "submitted_after_ms" INTEGER,
  ADD COLUMN IF NOT EXISTS "reported_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reported_reason" TEXT;

ALTER TABLE "compatibilities"
  ADD COLUMN IF NOT EXISTS "creator_ip_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "creator_user_agent_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "creator_device_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "partner_ip_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "partner_user_agent_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "partner_device_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "partner_submitted_after_ms" INTEGER,
  ADD COLUMN IF NOT EXISTS "reported_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reported_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "declined_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "clarity_circles_creator_device_hash_created_at_idx"
  ON "clarity_circles"("creator_device_hash", "created_at");

CREATE INDEX IF NOT EXISTS "clarity_circle_participants_circle_id_device_hash_idx"
  ON "clarity_circle_participants"("circle_id", "device_hash");

CREATE INDEX IF NOT EXISTS "clarity_circle_participants_answer_hash_created_at_idx"
  ON "clarity_circle_participants"("answer_hash", "created_at");

CREATE INDEX IF NOT EXISTS "compatibilities_creator_device_hash_created_at_idx"
  ON "compatibilities"("creator_device_hash", "created_at");

CREATE INDEX IF NOT EXISTS "compatibilities_partner_device_hash_created_at_idx"
  ON "compatibilities"("partner_device_hash", "created_at");
