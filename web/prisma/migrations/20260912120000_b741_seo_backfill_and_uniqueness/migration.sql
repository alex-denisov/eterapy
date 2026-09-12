-- B741: дописывание тонких карточек корпуса и след проверки уникальности.
--
-- `kind` различает новую страницу и дописанное тело чужой карточки: у второго
-- слаг принадлежит редакционному корпусу, и маршрут накладывает тело поверх
-- статической записи, а не подменяет её. Суточные потолки у них тоже разные —
-- новые выпускаются, старые дописываются осторожно.
ALTER TABLE "seo_library_pages" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PAGE';
ALTER TABLE "seo_library_pages" ADD COLUMN "uniqueness" JSONB;

CREATE INDEX "seo_library_pages_kind_published_at_idx" ON "seo_library_pages"("kind", "published_at");
