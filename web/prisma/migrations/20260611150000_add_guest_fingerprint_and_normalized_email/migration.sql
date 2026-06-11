-- B372 (M26): guest fingerprint for 1/month limit + normalized email for
-- gmail-alias duplicate detection.
-- IF NOT EXISTS: первая выкладка применилась частично (P3018 без отката DDL).

ALTER TABLE "dialogues" ADD COLUMN IF NOT EXISTS "guest_fingerprint" TEXT;
CREATE INDEX IF NOT EXISTS "dialogues_guest_fingerprint_intake_product_key_created_at_idx"
  ON "dialogues"("guest_fingerprint", "intake_product_key", "created_at");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "normalized_email" TEXT;
CREATE INDEX IF NOT EXISTS "users_normalized_email_idx" ON "users"("normalized_email");

-- Backfill: lowercase everywhere; gmail/googlemail local part loses dots and +suffix.
UPDATE "users" SET "normalized_email" =
  CASE
    WHEN lower(split_part(email, '@', 2)) IN ('gmail.com', 'googlemail.com') THEN
      replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
    ELSE lower(email)
  END
WHERE "normalized_email" IS NULL AND email IS NOT NULL;
