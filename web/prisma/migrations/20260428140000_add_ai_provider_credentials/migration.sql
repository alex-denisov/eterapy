-- AI Gateway: per-provider credential pool with at-rest encryption.
-- Stores multiple API keys per provider so routing can rotate on failures
-- and admins can manage keys without redeploys.

CREATE TABLE "ai_provider_credentials" (
  "id" TEXT NOT NULL,
  "provider" "AIProvider" NOT NULL,
  "label" TEXT NOT NULL,
  "encrypted_key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "base_url_override" TEXT,
  "model_override" TEXT,
  "last_used_at" TIMESTAMP(3),
  "last_success_at" TIMESTAMP(3),
  "last_error_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "last_error_message" TEXT,
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "cooldown_until" TIMESTAMP(3),
  "region_blocked" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_provider_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_credentials_provider_label_key"
  ON "ai_provider_credentials"("provider", "label");

CREATE INDEX "ai_provider_credentials_provider_enabled_priority_idx"
  ON "ai_provider_credentials"("provider", "enabled", "priority");

CREATE INDEX "ai_provider_credentials_provider_enabled_last_used_at_idx"
  ON "ai_provider_credentials"("provider", "enabled", "last_used_at");
