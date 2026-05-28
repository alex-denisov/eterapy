-- B333: Support chat tables (cabinet ↔ Telegram bridge).

CREATE TABLE IF NOT EXISTS "support_conversations" (
  "id"                  TEXT PRIMARY KEY,
  "user_id"             TEXT NOT NULL,
  "telegram_chat_id"    TEXT,
  "telegram_thread_id"  INTEGER,
  "status"              TEXT NOT NULL DEFAULT 'OPEN',
  "subject"             TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  "closed_at"           TIMESTAMP(3),

  CONSTRAINT "support_conversations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "support_conversations_user_id_status_idx"
  ON "support_conversations"("user_id", "status");

CREATE INDEX IF NOT EXISTS "support_conversations_telegram_chat_id_telegram_thread_id_idx"
  ON "support_conversations"("telegram_chat_id", "telegram_thread_id");

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id"                    TEXT PRIMARY KEY,
  "conversation_id"       TEXT NOT NULL,
  "role"                  TEXT NOT NULL,
  "content"               TEXT NOT NULL,
  "telegram_message_id"   INTEGER,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "support_messages_conversation_id_created_at_idx"
  ON "support_messages"("conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "support_messages_telegram_message_id_idx"
  ON "support_messages"("telegram_message_id");
