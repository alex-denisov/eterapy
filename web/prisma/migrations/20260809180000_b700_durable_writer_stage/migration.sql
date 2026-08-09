-- B700 — стадия автора становится durable.
--
-- Автор и редактор шли одной операцией: результат автора жил только в памяти
-- процесса, и отказ редактора по 429 выбрасывал оплаченный текст целиком.
-- Замер прода 09.08: 88 успешных генераций автора за сутки, ноль публикаций.
--
-- Текст автора ложится в `agent_writer_draft` до вызова редактора. Очередь
-- редактора становится собственной выборкой конвейера.
ALTER TABLE "external_publications"
  ADD COLUMN IF NOT EXISTS "agent_writer_draft" JSONB,
  ADD COLUMN IF NOT EXISTS "agent_written_at" TIMESTAMP(3);

-- Очередь редактора: строки с написанным, но ещё не отсмотренным текстом.
-- Частичный индекс, потому что таких строк единицы против всего реестра.
CREATE INDEX IF NOT EXISTS "external_publications_awaiting_review_idx"
  ON "external_publications" ("agent_written_at")
  WHERE "agent_writer_draft" IS NOT NULL AND "agent_reviewed_at" IS NULL;
