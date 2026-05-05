-- v5 entitlement-based unlocks, subscriptions, and auditable credit ledger.

ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'PRODUCT_UNLOCKED';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_STARTED';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CANCELLED';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PAYMENT_FAILED';

ALTER TABLE "transactions"
  ADD COLUMN "metadata" JSONB;

CREATE TABLE "product_entitlements" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productKey" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'purchase',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "transactionId" TEXT,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_entitlements_userId_status_productKey_idx"
  ON "product_entitlements"("userId", "status", "productKey");
CREATE INDEX "product_entitlements_transactionId_idx"
  ON "product_entitlements"("transactionId");
CREATE INDEX "product_entitlements_validUntil_idx"
  ON "product_entitlements"("validUntil");
ALTER TABLE "product_entitlements"
  ADD CONSTRAINT "product_entitlements_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_subscriptions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'TRIALING',
  "provider" TEXT NOT NULL DEFAULT 'yookassa',
  "providerSubscriptionId" TEXT,
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "cancelledAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_subscriptions_userId_status_idx"
  ON "user_subscriptions"("userId", "status");
CREATE INDEX "user_subscriptions_planKey_status_idx"
  ON "user_subscriptions"("planKey", "status");
CREATE INDEX "user_subscriptions_providerSubscriptionId_idx"
  ON "user_subscriptions"("providerSubscriptionId");
ALTER TABLE "user_subscriptions"
  ADD CONSTRAINT "user_subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "credit_ledger_entries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amountKopecks" INTEGER NOT NULL,
  "balanceAfterKopecks" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'yookassa',
  "transactionId" TEXT,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_ledger_entries_userId_createdAt_idx"
  ON "credit_ledger_entries"("userId", "createdAt");
CREATE INDEX "credit_ledger_entries_transactionId_idx"
  ON "credit_ledger_entries"("transactionId");
ALTER TABLE "credit_ledger_entries"
  ADD CONSTRAINT "credit_ledger_entries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
