-- B697: суточный срез перестал быть нарастающим итогом.
--
-- Поток (показы, клики, визиты) теперь берётся посуточным рядом источника за
-- всё окно, поэтому строки появляются и за сутки, когда среза не было. Уровень
-- (страниц в поиске, наблюдаемых запросов) за такие сутки НЕИЗВЕСТЕН, и `0`
-- вместо него читался бы как «в поиске не было ни одной страницы».
--
-- Накопленные строки несут оконные итоги потока (28 суток в каждой). Здесь их
-- НЕ обнуляем: ноль — тоже утверждение, и писать его миграцией значило бы
-- соврать. Ближайший проход воркера (тик — минута) перепишет их измеренными
-- посуточными значениями; уровень в этих строках снят честно и остаётся как был.
ALTER TABLE "marketing_daily_snapshots" ALTER COLUMN "searchable_pages" DROP NOT NULL;
ALTER TABLE "marketing_daily_snapshots" ALTER COLUMN "searchable_pages" DROP DEFAULT;
ALTER TABLE "marketing_daily_snapshots" ALTER COLUMN "observed_queries" DROP NOT NULL;
ALTER TABLE "marketing_daily_snapshots" ALTER COLUMN "observed_queries" DROP DEFAULT;
