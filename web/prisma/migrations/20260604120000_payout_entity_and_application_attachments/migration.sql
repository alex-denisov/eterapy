-- Y3: legal-entity (ИП/ООО) payout requisites alongside CARD/SBP for self-employed.
ALTER TABLE "payout_details"
  ADD COLUMN IF NOT EXISTS "legalName" TEXT,
  ADD COLUMN IF NOT EXISTS "inn" TEXT,
  ADD COLUMN IF NOT EXISTS "kpp" TEXT,
  ADD COLUMN IF NOT EXISTS "bik" TEXT,
  ADD COLUMN IF NOT EXISTS "corrAccount" TEXT;

-- Y5: practitioner verification — document attachments + admin review metadata.
ALTER TABLE "practitioner_applications"
  ADD COLUMN IF NOT EXISTS "attachments" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
