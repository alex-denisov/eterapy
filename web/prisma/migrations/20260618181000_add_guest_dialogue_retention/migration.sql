ALTER TABLE "dialogues"
  ADD COLUMN "data_residency" TEXT,
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "claimed_at" TIMESTAMP(3);

UPDATE "dialogues"
SET
  "data_residency" = 'RU_TEMP',
  "expires_at" = "created_at" + INTERVAL '72 hours'
WHERE "user_id" IS NULL
  AND "guest_session_id" IS NOT NULL
  AND "data_residency" IS NULL;

UPDATE "dialogues"
SET "data_residency" = 'RU_ACCOUNT'
WHERE "user_id" IS NOT NULL
  AND "data_residency" IS NULL;

CREATE INDEX "dialogues_guest_session_id_expires_at_idx"
  ON "dialogues"("guest_session_id", "expires_at");

CREATE INDEX "dialogues_data_residency_expires_at_idx"
  ON "dialogues"("data_residency", "expires_at");
