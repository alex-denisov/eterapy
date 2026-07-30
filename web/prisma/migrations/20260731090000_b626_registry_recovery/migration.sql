-- B626: причина архивации и счётчик автоперезапусков строки реестра.
ALTER TABLE "external_publications"
  ADD COLUMN IF NOT EXISTS "archive_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "recovery_count" INTEGER NOT NULL DEFAULT 0;

-- Перенос уже проставленных машинных причин в новое поле: без этого строки,
-- заархивированные до B626, остались бы «Архив» без объяснения навсегда.
UPDATE "external_publications"
   SET "archive_reason" = "last_error"
 WHERE "status" = 'ARCHIVED'
   AND "archive_reason" IS NULL
   AND "last_error" IS NOT NULL;

-- B626: суточный срез поисковой аналитики.
CREATE TABLE IF NOT EXISTS "marketing_daily_snapshots" (
  "id" TEXT NOT NULL,
  "day_key" TEXT NOT NULL,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "average_position" DOUBLE PRECISION,
  "searchable_pages" INTEGER NOT NULL DEFAULT 0,
  "organic_visits" INTEGER NOT NULL DEFAULT 0,
  "observed_queries" INTEGER NOT NULL DEFAULT 0,
  "sources" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_daily_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_daily_snapshots_day_key_key"
  ON "marketing_daily_snapshots"("day_key");
CREATE INDEX IF NOT EXISTS "marketing_daily_snapshots_day_key_idx"
  ON "marketing_daily_snapshots"("day_key");
