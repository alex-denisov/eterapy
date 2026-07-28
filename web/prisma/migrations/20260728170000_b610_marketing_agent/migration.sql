ALTER TABLE "external_publications"
  ADD COLUMN "media_url" TEXT,
  ADD COLUMN "engagement_target_url" TEXT,
  ADD COLUMN "engagement_target_id" TEXT,
  ADD COLUMN "engagement_target_label" TEXT,
  ADD COLUMN "engagement_excerpt" TEXT,
  ADD COLUMN "telegram_review_message_id" INTEGER,
  ADD COLUMN "agent_writer_provider" TEXT,
  ADD COLUMN "agent_writer_model" TEXT,
  ADD COLUMN "agent_reviewer_provider" TEXT,
  ADD COLUMN "agent_reviewer_model" TEXT,
  ADD COLUMN "agent_review" JSONB,
  ADD COLUMN "agent_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "moderation_decision_by" TEXT,
  ADD COLUMN "moderation_decision_at" TIMESTAMP(3);

CREATE TABLE "marketing_automation_signals" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "evidence" JSONB,
  "suggested_ticket" TEXT,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketing_automation_signals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_automation_signals_key_key"
  ON "marketing_automation_signals"("key");
CREATE INDEX "marketing_automation_signals_status_severity_last_seen_at_idx"
  ON "marketing_automation_signals"("status", "severity", "last_seen_at");

ALTER TABLE "transactions"
  ADD COLUMN "fiscal_receipt_status" TEXT,
  ADD COLUMN "fiscal_receipt_ref" TEXT,
  ADD COLUMN "fiscal_receipt_checked_at" TIMESTAMP(3),
  ADD COLUMN "fiscal_receipt_error" TEXT;

ALTER TABLE "ip_ledger_entries"
  ADD COLUMN "import_key" TEXT,
  ADD COLUMN "import_source" TEXT;
CREATE UNIQUE INDEX "ip_ledger_entries_import_key_key"
  ON "ip_ledger_entries"("import_key");
