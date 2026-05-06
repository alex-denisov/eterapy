-- B085: durable paid product outputs, starting with Deep Report.

CREATE TABLE "product_results" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "dialogue_id" TEXT,
  "product_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREVIEW',
  "title" TEXT NOT NULL,
  "preview_text" TEXT,
  "result_text" TEXT,
  "saved_at" TIMESTAMP(3),
  "exported_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_results_user_id_product_key_updated_at_idx" ON "product_results"("user_id", "product_key", "updated_at");
CREATE INDEX "product_results_dialogue_id_product_key_idx" ON "product_results"("dialogue_id", "product_key");
CREATE INDEX "product_results_status_updated_at_idx" ON "product_results"("status", "updated_at");

ALTER TABLE "product_results"
  ADD CONSTRAINT "product_results_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_results"
  ADD CONSTRAINT "product_results_dialogue_id_fkey"
  FOREIGN KEY ("dialogue_id") REFERENCES "dialogues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
