-- B372 (M26): guest fingerprint for 1/month limit + normalized email for
-- gmail-alias duplicate detection.

ALTER TABLE "dialogues" ADD COLUMN "guest_fingerprint" TEXT;
CREATE INDEX "dialogues_guest_fingerprint_intake_product_key_created_at_idx"
  ON "dialogues"("guest_fingerprint", "intake_product_key", "created_at");

ALTER TABLE "users" ADD COLUMN "normalized_email" TEXT;
CREATE INDEX "users_normalized_email_idx" ON "users"("normalized_email");

-- Backfill: lowercase everywhere; gmail/googlemail local part loses dots and +suffix.
UPDATE "users" SET "normalized_email" =
  CASE
    WHEN lower(split_part(email, '@', 2)) IN ('gmail.com', 'googlemail.com') THEN
      replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
    ELSE lower(email)
  END
WHERE email IS NOT NULL;
