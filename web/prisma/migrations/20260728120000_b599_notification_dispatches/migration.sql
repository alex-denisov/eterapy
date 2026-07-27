-- B599 (батч №20): журнал СЛУЖЕБНЫХ отправок.
--
-- Владелец: «я хочу чтобы в этом разделе можно было посмотреть кому отправлены
-- уведомления (системные, маркетинговые и др), когда, что именно было в этом
-- уведомлении».
--
-- Маркетинговые отправки писались в `marketing_dispatches` с батча №18, а
-- служебные — никуда: WEB-канал оставлял запись в `notifications`, а письмо и
-- Telegram исчезали в логе процесса, который умирает вместе с выкаткой.
-- «Человек говорит, что не получил письмо» было неразрешимым спором.
--
-- Отдельная таблица, а не колонка `kind` в маркетинговой: у служебных нет
-- категории, причины отказа и гейтов, а у маркетинговых нет `job_id`. Общая
-- таблица означала бы половину колонок, всегда пустых у одной из сторон.
--
-- `user_id` NULLABLE намеренно: приглашение модератора и подтверждение почты
-- уходят на адрес, за которым аккаунта может ещё (или уже) не быть.

CREATE TABLE IF NOT EXISTS "notification_dispatches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "recipient" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_dispatches_user_id_created_at_idx"
    ON "notification_dispatches"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "notification_dispatches_event_created_at_idx"
    ON "notification_dispatches"("event", "created_at");
CREATE INDEX IF NOT EXISTS "notification_dispatches_created_at_idx"
    ON "notification_dispatches"("created_at");

DO $$
BEGIN
    ALTER TABLE "notification_dispatches"
        ADD CONSTRAINT "notification_dispatches_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
