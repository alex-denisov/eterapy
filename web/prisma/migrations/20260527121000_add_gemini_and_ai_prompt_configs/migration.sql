ALTER TYPE "AIProvider" ADD VALUE IF NOT EXISTS 'GEMINI';

CREATE TABLE IF NOT EXISTS "ai_prompt_configs" (
  "id" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "product_key" TEXT,
  "prompt_text" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_prompt_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_prompt_configs_feature_key"
  ON "ai_prompt_configs"("feature");

CREATE INDEX IF NOT EXISTS "ai_prompt_configs_enabled_feature_idx"
  ON "ai_prompt_configs"("enabled", "feature");

CREATE INDEX IF NOT EXISTS "ai_prompt_configs_product_key_idx"
  ON "ai_prompt_configs"("product_key");
