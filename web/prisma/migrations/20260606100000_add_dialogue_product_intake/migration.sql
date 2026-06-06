ALTER TABLE "dialogues"
  ADD COLUMN "intake_product_key" TEXT,
  ADD COLUMN "intake_mode" TEXT;

CREATE INDEX "dialogues_user_id_intake_product_key_created_at_idx"
  ON "dialogues"("user_id", "intake_product_key", "created_at");

CREATE INDEX "dialogues_guest_session_id_intake_product_key_created_at_idx"
  ON "dialogues"("guest_session_id", "intake_product_key", "created_at");
