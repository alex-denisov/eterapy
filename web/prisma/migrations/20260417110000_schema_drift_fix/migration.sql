-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELLED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "complaints" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "practitioner_applications" ALTER COLUMN "specialties" DROP DEFAULT,
ALTER COLUMN "formats" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "practitioners" ADD COLUMN     "commissionPercent" INTEGER NOT NULL DEFAULT 25;

-- AlterTable
ALTER TABLE "tool_sessions" ADD COLUMN     "tier" TEXT NOT NULL DEFAULT 'quick';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "balance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "provider" TEXT DEFAULT 'web',
ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "registrationChannel" TEXT,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "saved_cards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "expiryMonth" TEXT NOT NULL,
    "expiryYear" TEXT NOT NULL,
    "cardholderName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'yookassa',
    "providerPaymentId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_cards_paymentMethodId_key" ON "saved_cards"("paymentMethodId");

-- CreateIndex
CREATE INDEX "saved_cards_userId_idx" ON "saved_cards"("userId");

-- CreateIndex
CREATE INDEX "transactions_userId_createdAt_idx" ON "transactions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_providerPaymentId_key" ON "transactions"("providerPaymentId");

-- CreateIndex
CREATE INDEX "users_provider_providerId_idx" ON "users"("provider", "providerId");

-- CreateIndex
CREATE INDEX "users_email_provider_idx" ON "users"("email", "provider");

-- AddForeignKey
ALTER TABLE "saved_cards" ADD CONSTRAINT "saved_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ai_session_logs_userId_createdAt" RENAME TO "ai_session_logs_userId_createdAt_idx";

-- RenameIndex
ALTER INDEX "complaints_status_createdAt" RENAME TO "complaints_status_createdAt_idx";

