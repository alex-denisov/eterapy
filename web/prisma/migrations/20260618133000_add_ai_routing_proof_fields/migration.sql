ALTER TABLE "ai_requests"
  ADD COLUMN IF NOT EXISTS "provider_group" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_region" TEXT,
  ADD COLUMN IF NOT EXISTS "cloudflare_ai_gateway_used" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "foreign_llm_used" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cross_border_processing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fallback_used" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fallback_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "billing_event_id" TEXT;

ALTER TABLE "ai_attempts"
  ADD COLUMN IF NOT EXISTS "provider_group" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_region" TEXT,
  ADD COLUMN IF NOT EXISTS "cloudflare_ai_gateway_used" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "foreign_llm_used" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cross_border_processing" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "ai_requests_provider_group_created_at_idx"
  ON "ai_requests"("provider_group", "created_at");

CREATE INDEX IF NOT EXISTS "ai_requests_foreign_llm_used_cloudflare_ai_gateway_used_cross_border_processing_created_at_idx"
  ON "ai_requests"("foreign_llm_used", "cloudflare_ai_gateway_used", "cross_border_processing", "created_at");

CREATE INDEX IF NOT EXISTS "ai_attempts_provider_group_started_at_idx"
  ON "ai_attempts"("provider_group", "started_at");

CREATE INDEX IF NOT EXISTS "ai_attempts_foreign_llm_used_cloudflare_ai_gateway_used_cross_border_processing_started_at_idx"
  ON "ai_attempts"("foreign_llm_used", "cloudflare_ai_gateway_used", "cross_border_processing", "started_at");
