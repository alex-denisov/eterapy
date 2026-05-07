-- B098: once-per-day clarity card with notification preferences.

ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'DAILY_CARD';

CREATE TABLE "daily_cards" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "card_date" TIMESTAMP(3) NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "metadata" JSONB,
  "shared_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "daily_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_cards_user_id_card_date_key" ON "daily_cards"("user_id", "card_date");
CREATE INDEX "daily_cards_user_id_created_at_idx" ON "daily_cards"("user_id", "created_at");

ALTER TABLE "daily_cards"
  ADD CONSTRAINT "daily_cards_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
