ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "payment_decline_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "offer_version" TEXT,
  ADD COLUMN IF NOT EXISTS "terms_version" TEXT,
  ADD COLUMN IF NOT EXISTS "consent_version" TEXT;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "payment_decline_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "offer_version" TEXT,
  ADD COLUMN IF NOT EXISTS "terms_version" TEXT,
  ADD COLUMN IF NOT EXISTS "consent_version" TEXT;

CREATE INDEX IF NOT EXISTS "transactions_payment_decline_reason_created_at_idx"
  ON "transactions"("payment_decline_reason", "createdAt");

CREATE INDEX IF NOT EXISTS "payments_payment_decline_reason_created_at_idx"
  ON "payments"("payment_decline_reason", "createdAt");
