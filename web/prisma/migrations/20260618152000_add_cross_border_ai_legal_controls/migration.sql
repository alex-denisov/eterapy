DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ManagementSpecialOrderStatus') THEN
    CREATE TYPE "ManagementSpecialOrderStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REVOKED', 'EXPIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ForeignProviderRegistryStatus') THEN
    CREATE TYPE "ForeignProviderRegistryStatus" AS ENUM ('ACTIVE', 'INACTIVE_FOR_RU', 'INACTIVE_FOR_RU_PROMPTS', 'BLOCKED', 'FUTURE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "management_special_orders" (
  "id" TEXT NOT NULL,
  "order_number" TEXT NOT NULL,
  "order_date" TIMESTAMP(3) NOT NULL,
  "initiator" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "legal_basis" TEXT NOT NULL,
  "risk_assessment" TEXT NOT NULL,
  "allowed_providers" "AIProvider"[] NOT NULL DEFAULT ARRAY[]::"AIProvider"[],
  "allowed_scenarios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "valid_from" TIMESTAMP(3) NOT NULL,
  "valid_to" TIMESTAMP(3) NOT NULL,
  "status" "ManagementSpecialOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "approved_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "management_special_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "foreign_provider_registry" (
  "id" TEXT NOT NULL,
  "provider_name_internal" TEXT NOT NULL,
  "provider_category" TEXT NOT NULL,
  "country_or_region" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "potential_data_categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "ForeignProviderRegistryStatus" NOT NULL DEFAULT 'INACTIVE_FOR_RU',
  "legal_basis" TEXT,
  "dpa_status" TEXT,
  "terms_review_status" TEXT,
  "rkn_cross_border_status" TEXT,
  "last_reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "foreign_provider_registry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "management_special_orders_order_number_key"
  ON "management_special_orders"("order_number");

CREATE INDEX IF NOT EXISTS "management_special_orders_status_valid_from_valid_to_idx"
  ON "management_special_orders"("status", "valid_from", "valid_to");

CREATE UNIQUE INDEX IF NOT EXISTS "foreign_provider_registry_provider_name_internal_key"
  ON "foreign_provider_registry"("provider_name_internal");

CREATE INDEX IF NOT EXISTS "foreign_provider_registry_status_provider_category_idx"
  ON "foreign_provider_registry"("status", "provider_category");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'management_special_orders_approved_by_fkey'
  ) THEN
    ALTER TABLE "management_special_orders"
      ADD CONSTRAINT "management_special_orders_approved_by_fkey"
      FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "foreign_provider_registry" (
  "id",
  "provider_name_internal",
  "provider_category",
  "country_or_region",
  "role",
  "potential_data_categories",
  "status",
  "legal_basis",
  "dpa_status",
  "terms_review_status",
  "rkn_cross_border_status",
  "last_reviewed_at"
) VALUES
  ('fpr_yandex', 'YANDEX', 'primary_llm', 'RU', 'Primary Russian LLM and OCR provider', ARRAY['dialogue_text', 'image_ocr']::TEXT[], 'ACTIVE', 'Russian processing contour', 'not_required_ru', 'approved', 'not_cross_border', CURRENT_TIMESTAMP),
  ('fpr_openai', 'OPENAI', 'llm', 'US', 'Dormant foreign LLM fallback', ARRAY['dialogue_text']::TEXT[], 'INACTIVE_FOR_RU', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP),
  ('fpr_anthropic', 'ANTHROPIC', 'llm', 'US', 'Dormant foreign LLM fallback', ARRAY['dialogue_text']::TEXT[], 'INACTIVE_FOR_RU', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP),
  ('fpr_fireworks', 'FIREWORKS', 'llm', 'US', 'Dormant foreign LLM fallback', ARRAY['dialogue_text']::TEXT[], 'INACTIVE_FOR_RU', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP),
  ('fpr_openrouter', 'OPENROUTER', 'llm_gateway', 'US', 'Dormant foreign LLM router', ARRAY['dialogue_text']::TEXT[], 'INACTIVE_FOR_RU', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP),
  ('fpr_gemini', 'GEMINI', 'llm', 'US', 'Dormant foreign LLM fallback', ARRAY['dialogue_text']::TEXT[], 'INACTIVE_FOR_RU', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP),
  ('fpr_groq', 'GROQ', 'llm', 'US', 'Dormant foreign LLM fallback', ARRAY['dialogue_text']::TEXT[], 'INACTIVE_FOR_RU', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP),
  ('fpr_mistral', 'MISTRAL', 'llm', 'EU', 'Dormant foreign LLM fallback', ARRAY['dialogue_text']::TEXT[], 'INACTIVE_FOR_RU', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP),
  ('fpr_cerebras', 'CEREBRAS', 'llm', 'US', 'Dormant foreign LLM fallback', ARRAY['dialogue_text']::TEXT[], 'INACTIVE_FOR_RU', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP),
  ('fpr_cohere', 'COHERE', 'llm', 'CA', 'Dormant foreign LLM fallback', ARRAY['dialogue_text']::TEXT[], 'INACTIVE_FOR_RU', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP),
  ('fpr_cloudflare_ai_gateway', 'CLOUDFLARE_AI_GATEWAY', 'gateway', 'US', 'Dormant AI gateway for prompt traffic', ARRAY['dialogue_text', 'provider_metadata']::TEXT[], 'INACTIVE_FOR_RU_PROMPTS', NULL, 'not_ready', 'pending', 'not_submitted', CURRENT_TIMESTAMP)
ON CONFLICT ("provider_name_internal") DO UPDATE SET
  "provider_category" = EXCLUDED."provider_category",
  "country_or_region" = EXCLUDED."country_or_region",
  "role" = EXCLUDED."role",
  "potential_data_categories" = EXCLUDED."potential_data_categories",
  "status" = EXCLUDED."status",
  "legal_basis" = EXCLUDED."legal_basis",
  "dpa_status" = EXCLUDED."dpa_status",
  "terms_review_status" = EXCLUDED."terms_review_status",
  "rkn_cross_border_status" = EXCLUDED."rkn_cross_border_status",
  "last_reviewed_at" = EXCLUDED."last_reviewed_at",
  "updated_at" = CURRENT_TIMESTAMP;
