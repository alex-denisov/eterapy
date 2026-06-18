ALTER TABLE "users"
  ADD COLUMN "retention_anonymized_at" TIMESTAMP(3);

CREATE TABLE "deletion_logs" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "policy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "metadata" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deletion_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deletion_logs_category_occurred_at_idx"
  ON "deletion_logs"("category", "occurred_at");

CREATE INDEX "deletion_logs_target_type_target_id_idx"
  ON "deletion_logs"("target_type", "target_id");
