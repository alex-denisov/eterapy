-- AI Gateway: cached per-provider model catalog.
-- Refreshed on demand from each provider's /v1/models endpoint
-- and used to populate model dropdowns in the AI Control Center.

CREATE TABLE "ai_provider_models" (
  "id" TEXT NOT NULL,
  "provider" "AIProvider" NOT NULL,
  "model_id" TEXT NOT NULL,
  "display_name" TEXT,
  "is_free" BOOLEAN NOT NULL DEFAULT false,
  "context_window" INTEGER,
  "metadata" JSONB,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_provider_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_models_provider_model_id_key"
  ON "ai_provider_models" ("provider", "model_id");

CREATE INDEX "ai_provider_models_provider_is_free_idx"
  ON "ai_provider_models" ("provider", "is_free");
