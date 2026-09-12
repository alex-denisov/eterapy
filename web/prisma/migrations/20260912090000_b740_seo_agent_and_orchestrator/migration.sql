-- B740: автономный SEO-агент (спрос → страница Библиотеки) и оркестратор.
--
-- Три таблицы, три разных срока жизни данных:
--   seo_keyword_candidates — спрос, снятый живьём; живёт дольше одного прохода,
--     иначе агент писал бы второй раз то, что уже выпустил;
--   seo_library_pages      — сами страницы; лежат в базе, а не в коде, чтобы
--     выпуск стоил секунду, а не полную пересборку образа;
--   agent_directives       — след каждого решения оркестратора вместе с
--     состоянием ДО применения, иначе откат невозможен.

CREATE TABLE "seo_keyword_candidates" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "display_phrase" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "monthly_demand" INTEGER,
    "growth" DOUBLE PRECISION,
    "cluster" TEXT,
    "service" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "reject_reason" TEXT,
    "page_slug" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_keyword_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seo_keyword_candidates_phrase_key" ON "seo_keyword_candidates"("phrase");
CREATE INDEX "seo_keyword_candidates_status_monthly_demand_idx" ON "seo_keyword_candidates"("status", "monthly_demand");
CREATE INDEX "seo_keyword_candidates_status_last_seen_at_idx" ON "seo_keyword_candidates"("status", "last_seen_at");

CREATE TABLE "seo_library_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "question" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "meta_title" TEXT NOT NULL,
    "meta_description" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "perspectives" TEXT[],
    "faqs" JSONB NOT NULL,
    "main_fork_title" TEXT,
    "main_fork_note" TEXT,
    "first_step" TEXT,
    "cta_product" TEXT NOT NULL,
    "target_query" TEXT NOT NULL,
    "target_demand" INTEGER,
    "demand_source" TEXT NOT NULL,
    "cluster" TEXT,
    "writer_provider" TEXT,
    "writer_model" TEXT,
    "reviewer_provider" TEXT,
    "reviewer_model" TEXT,
    "review" JSONB,
    "review_rounds" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_library_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seo_library_pages_slug_key" ON "seo_library_pages"("slug");
CREATE INDEX "seo_library_pages_status_published_at_idx" ON "seo_library_pages"("status", "published_at");
CREATE INDEX "seo_library_pages_topic_status_idx" ON "seo_library_pages"("topic", "status");

CREATE TABLE "agent_directives" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "previous" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "problem" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "risk" TEXT NOT NULL DEFAULT 'reversible',
    "reported_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "failed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_directives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_directives_key_key" ON "agent_directives"("key");
CREATE INDEX "agent_directives_status_created_at_idx" ON "agent_directives"("status", "created_at");
CREATE INDEX "agent_directives_target_created_at_idx" ON "agent_directives"("target", "created_at");
