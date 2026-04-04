-- AlterTable: add telegramId and telegramUsername to users
ALTER TABLE "users" ADD COLUMN "telegramId" TEXT;
ALTER TABLE "users" ADD COLUMN "telegramUsername" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegramId_key" ON "users"("telegramId");

-- CreateEnum: NotificationEvent
CREATE TYPE "NotificationEvent" AS ENUM (
  'BOOKING_REQUESTED',
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'BOOKING_REMINDER',
  'SESSION_STARTED',
  'SESSION_COMPLETED',
  'REVIEW_REQUESTED',
  'NEW_REVIEW',
  'PAYMENT_RECEIVED'
);

-- CreateEnum: NotificationChannel
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'TELEGRAM');

-- CreateTable: notification_preferences
CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "event" "NotificationEvent" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "remindBeforeHours" INTEGER,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_userId_event_channel_key"
  ON "notification_preferences"("userId", "event", "channel");
CREATE INDEX "notification_preferences_userId_idx"
  ON "notification_preferences"("userId");

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
