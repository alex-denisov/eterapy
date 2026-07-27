-- B599: журнал маркетинговых отправок + согласие на рекламу отдельным полем.
--
-- Согласие НЕ выводится из транзакционных настроек уведомлений: по 38-ФЗ ст. 18
-- реклама требует предварительного согласия, и галочка «присылать напоминания о
-- записи» им не является. Поэтому у всех существующих пользователей поле
-- остаётся NULL — то есть до явного согласия маркетинг им не уходит вовсе.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_consent_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_consent_source" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_opt_out_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "marketing_dispatches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "blocked_by" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "marketing_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "marketing_dispatches_user_id_created_at_idx"
    ON "marketing_dispatches"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "marketing_dispatches_event_key_created_at_idx"
    ON "marketing_dispatches"("event_key", "created_at");
CREATE INDEX IF NOT EXISTS "marketing_dispatches_status_created_at_idx"
    ON "marketing_dispatches"("status", "created_at");

DO $$
BEGIN
    ALTER TABLE "marketing_dispatches"
        ADD CONSTRAINT "marketing_dispatches_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
