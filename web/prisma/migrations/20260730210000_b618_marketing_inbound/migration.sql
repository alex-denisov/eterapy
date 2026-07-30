-- B618: единая очередь входящего из соцсетей.
--
-- Дедупликация живёт в базе, а не в коде: пара (platform, external_id)
-- уникальна, поэтому повторная доставка того же webhook не может создать второе
-- входящее, а уникальный external_publications.inbound_reply_to_id не даёт
-- отправить на одно входящее два ответа.
CREATE TABLE IF NOT EXISTS "marketing_inbound_messages" (
  "id"           TEXT NOT NULL,
  "platform"     TEXT NOT NULL,
  "kind"         TEXT NOT NULL,
  "external_id"  TEXT NOT NULL,
  "thread_id"    TEXT,
  "author_label" TEXT,
  "text"         TEXT NOT NULL,
  "permalink"    TEXT,
  "status"       TEXT NOT NULL DEFAULT 'RECEIVED',
  "harm_score"   INTEGER,
  "received_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answered_at"  TIMESTAMP(3),
  "last_error"   TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_inbound_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_inbound_messages_platform_external_id_key"
  ON "marketing_inbound_messages" ("platform", "external_id");
CREATE INDEX IF NOT EXISTS "marketing_inbound_messages_status_received_at_idx"
  ON "marketing_inbound_messages" ("status", "received_at");
CREATE INDEX IF NOT EXISTS "marketing_inbound_messages_platform_received_at_idx"
  ON "marketing_inbound_messages" ("platform", "received_at");

ALTER TABLE "external_publications"
  ADD COLUMN IF NOT EXISTS "inbound_reply_to_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "external_publications_inbound_reply_to_id_key"
  ON "external_publications" ("inbound_reply_to_id");

DO $$
BEGIN
  ALTER TABLE "external_publications"
    ADD CONSTRAINT "external_publications_inbound_reply_to_id_fkey"
    FOREIGN KEY ("inbound_reply_to_id")
    REFERENCES "marketing_inbound_messages" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
