-- M21 B209: auditable non-cash clarity credits.
-- Existing credit_ledger_entries tracks ruble balance movements; this table
-- tracks product credits with status, expiry, source, and clawback support.

CREATE TABLE IF NOT EXISTS "clarity_credit_ledger_entries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceEventId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "clarity_credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "clarity_credit_ledger_entries_userId_status_createdAt_idx"
  ON "clarity_credit_ledger_entries"("userId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "clarity_credit_ledger_entries_source_sourceEventId_idx"
  ON "clarity_credit_ledger_entries"("source", "sourceEventId");

CREATE INDEX IF NOT EXISTS "clarity_credit_ledger_entries_expiresAt_idx"
  ON "clarity_credit_ledger_entries"("expiresAt");

ALTER TABLE "clarity_credit_ledger_entries"
  ADD CONSTRAINT "clarity_credit_ledger_entries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
