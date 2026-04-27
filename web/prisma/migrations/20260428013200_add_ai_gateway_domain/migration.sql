-- Durable AI Gateway model: provider config, routing, request attempts, and budget ledger.

CREATE TYPE "AIProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'FIREWORKS', 'OPENROUTER');
CREATE TYPE "AIRequestStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AIAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'RATE_LIMITED', 'SKIPPED');

CREATE TABLE "ai_provider_configs" (
  "id" TEXT NOT NULL,
  "provider" "AIProvider" NOT NULL,
  "display_name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "base_url" TEXT,
  "default_model" TEXT,
  "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
  "rpm_limit" INTEGER,
  "tpm_limit" INTEGER,
  "input_token_cost_micros" INTEGER,
  "output_token_cost_micros" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_routing_policies" (
  "id" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "provider_order" "AIProvider"[] NOT NULL DEFAULT ARRAY[]::"AIProvider"[],
  "model_preferences" JSONB,
  "max_tokens" INTEGER,
  "temperature" DOUBLE PRECISION,
  "timeout_ms" INTEGER,
  "daily_token_budget" INTEGER,
  "per_user_daily_token_budget" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_routing_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_requests" (
  "id" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "user_id" TEXT,
  "status" "AIRequestStatus" NOT NULL DEFAULT 'PENDING',
  "request_hash" TEXT,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_micros" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_attempts" (
  "id" TEXT NOT NULL,
  "ai_request_id" TEXT NOT NULL,
  "provider" "AIProvider" NOT NULL,
  "model" TEXT NOT NULL,
  "status" "AIAttemptStatus" NOT NULL DEFAULT 'RUNNING',
  "latency_ms" INTEGER,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_micros" INTEGER NOT NULL DEFAULT 0,
  "error_code" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),

  CONSTRAINT "ai_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_budget_ledger" (
  "id" TEXT NOT NULL,
  "scope_type" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "cost_micros" INTEGER NOT NULL DEFAULT 0,
  "request_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_budget_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_configs_provider_key" ON "ai_provider_configs"("provider");
CREATE INDEX "ai_provider_configs_enabled_priority_idx" ON "ai_provider_configs"("enabled", "priority");
CREATE UNIQUE INDEX "ai_routing_policies_feature_key" ON "ai_routing_policies"("feature");
CREATE INDEX "ai_routing_policies_enabled_feature_idx" ON "ai_routing_policies"("enabled", "feature");
CREATE INDEX "ai_requests_feature_created_at_idx" ON "ai_requests"("feature", "created_at");
CREATE INDEX "ai_requests_user_id_created_at_idx" ON "ai_requests"("user_id", "created_at");
CREATE INDEX "ai_requests_status_created_at_idx" ON "ai_requests"("status", "created_at");
CREATE INDEX "ai_attempts_ai_request_id_started_at_idx" ON "ai_attempts"("ai_request_id", "started_at");
CREATE INDEX "ai_attempts_provider_status_started_at_idx" ON "ai_attempts"("provider", "status", "started_at");
CREATE UNIQUE INDEX "ai_budget_ledger_scope_type_scope_key_period_key" ON "ai_budget_ledger"("scope_type", "scope_key", "period");
CREATE INDEX "ai_budget_ledger_period_scope_type_idx" ON "ai_budget_ledger"("period", "scope_type");

ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_attempts" ADD CONSTRAINT "ai_attempts_ai_request_id_fkey" FOREIGN KEY ("ai_request_id") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
