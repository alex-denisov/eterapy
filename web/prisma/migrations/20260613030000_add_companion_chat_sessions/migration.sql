-- B386 (M26): платный чат-компаньон «Решить вопрос в чате». Идемпотентно
-- (IF NOT EXISTS) на случай частичного применения — как в прошлых миграциях M26.

CREATE TABLE IF NOT EXISTS "companion_chat_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source_dialogue_id" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'explore',
  "status" TEXT NOT NULL DEFAULT 'free',
  "free_messages_used" INTEGER NOT NULL DEFAULT 0,
  "paid_started_at" TIMESTAMP(3),
  "paid_expires_at" TIMESTAMP(3),
  "premium_included" BOOLEAN NOT NULL DEFAULT false,
  "messages" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "companion_chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "companion_chat_user_updated_idx"
  ON "companion_chat_sessions" ("user_id", "updated_at");

CREATE INDEX IF NOT EXISTS "companion_chat_premium_quota_idx"
  ON "companion_chat_sessions" ("user_id", "premium_included", "paid_started_at");

DO $$ BEGIN
  ALTER TABLE "companion_chat_sessions"
    ADD CONSTRAINT "companion_chat_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
