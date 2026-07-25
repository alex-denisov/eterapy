-- B577: durable external-publication registry and metric snapshots.
CREATE TABLE "external_publications" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "channel_name" TEXT,
    "title" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "public_url" TEXT,
    "destination_url" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "target_query" TEXT,
    "cluster" TEXT,
    "index_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "published_at" TIMESTAMP(3),
    "last_index_check_at" TIMESTAMP(3),
    "next_review_at" TIMESTAMP(3),
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ADMIN_UI',
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_publication_metrics" (
    "id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "reach" INTEGER,
    "views" INTEGER,
    "reactions" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "outbound_clicks" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_publication_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_publications_key_key" ON "external_publications"("key");
CREATE UNIQUE INDEX "external_publications_public_url_key" ON "external_publications"("public_url");
CREATE INDEX "external_publications_status_published_at_idx" ON "external_publications"("status", "published_at");
CREATE INDEX "external_publications_platform_published_at_idx" ON "external_publications"("platform", "published_at");
CREATE INDEX "external_publications_index_status_last_index_check_at_idx" ON "external_publications"("index_status", "last_index_check_at");
CREATE INDEX "external_publications_next_review_at_idx" ON "external_publications"("next_review_at");
CREATE INDEX "external_publications_utm_source_utm_campaign_idx" ON "external_publications"("utm_source", "utm_campaign");
CREATE INDEX "external_publication_metrics_publication_id_recorded_at_idx" ON "external_publication_metrics"("publication_id", "recorded_at");

ALTER TABLE "external_publication_metrics"
ADD CONSTRAINT "external_publication_metrics_publication_id_fkey"
FOREIGN KEY ("publication_id") REFERENCES "external_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the two already-published, publicly verified Dzen articles so the
-- registry is useful immediately after deploy. Stable keys make future code
-- upserts idempotent.
INSERT INTO "external_publications" (
  "id", "key", "platform", "channel_name", "title", "content_type", "status",
  "public_url", "destination_url", "utm_source", "utm_medium", "utm_campaign",
  "target_query", "cluster", "index_status", "published_at", "next_review_at",
  "notes", "source", "created_by", "updated_by"
) VALUES
(
  'b577_dzen_relationship_silence', 'dzen-relationship-silence-2026-07-23',
  'DZEN', 'ETerapy — вопросы, ясность, следующий шаг',
  'Почему он перестал писать: 5 версий вместо самообвинения', 'ARTICLE', 'PUBLISHED',
  'https://dzen.ru/a/amFfUQYIc3XurjAe',
  'https://eterapy.com/library/on-perestayal-pisat-i-ya-ne-znayu-pochemu?utm_source=dzen&utm_medium=organic&utm_campaign=relationship_silence',
  'dzen', 'organic', 'relationship_silence', 'почему он перестал писать',
  'Отношения', 'UNKNOWN', '2026-07-23T00:50:00.000Z', '2026-07-30T00:50:00.000Z',
  'Публично проверены полный текст, safety boundary и кликабельная UTM-карточка.',
  'MIGRATION', 'agent:b551', 'agent:b577'
),
(
  'b577_dzen_dream_teeth', 'dzen-dream-teeth-2026-07-23',
  'DZEN', 'ETerapy — вопросы, ясность, следующий шаг',
  'К чему снится, что выпадают зубы: 6 вопросов без страшного сонника', 'ARTICLE', 'PUBLISHED',
  'https://dzen.ru/a/amFsdDtvbj9IuMa9',
  'https://eterapy.com/library/snitsya-chto-vypadayut-zuby-pered-vazhnymi-sobytiyami?utm_source=dzen&utm_medium=organic&utm_campaign=dream_teeth',
  'dzen', 'organic', 'dream_teeth', 'к чему снится выпадение зубов',
  'Сны и символы', 'UNKNOWN', '2026-07-23T01:25:00.000Z', '2026-07-30T01:25:00.000Z',
  'Публично проверены 5223 знака, 6 контекстных вопросов, практика на 7 дней и safety boundary.',
  'MIGRATION', 'agent:b551', 'agent:b577'
);
