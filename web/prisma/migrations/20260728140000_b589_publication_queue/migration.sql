-- B589 фаза 1: реестр внешних публикаций становится ОЧЕРЕДЬЮ.
--
-- Реестр (B577) учитывал уже опубликованное: у записи не было ни текста поста,
-- ни времени выпуска — то есть по нему нельзя было ни сгенерировать, ни
-- выпустить. Отдельная таблица очереди разъехалась бы с реестром на второй
-- неделе (две правды об одной публикации), поэтому колонки добавляются сюда.
--
-- `auto_publish` по умолчанию FALSE: черновик не выходит наружу сам. Публикация
-- необратима, и первые две недели переход в SCHEDULED делает человек.

ALTER TABLE "external_publications" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "external_publications" ADD COLUMN IF NOT EXISTS "scheduled_for" TIMESTAMP(3);
ALTER TABLE "external_publications" ADD COLUMN IF NOT EXISTS "auto_publish" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "external_publications" ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "external_publications" ADD COLUMN IF NOT EXISTS "last_error" TEXT;
ALTER TABLE "external_publications" ADD COLUMN IF NOT EXISTS "external_post_id" TEXT;
ALTER TABLE "external_publications" ADD COLUMN IF NOT EXISTS "plan_slot" TEXT;

-- Слот плана занимается ровно один раз: без этого повторный запуск генератора
-- наплодил бы по черновику на тик воркера.
CREATE UNIQUE INDEX IF NOT EXISTS "external_publications_plan_slot_key"
    ON "external_publications"("plan_slot")
    WHERE "plan_slot" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "external_publications_status_scheduled_for_idx"
    ON "external_publications"("status", "scheduled_for");
