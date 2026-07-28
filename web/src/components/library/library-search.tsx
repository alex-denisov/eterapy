"use client";

import { useState, useDeferredValue, useEffect, useMemo } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import type { AnonymousLibraryEntry, LibrarySection } from "@/data/anonymous-library";
import { resolveLibraryTopic } from "@/lib/library-cta";

const PAGE_SIZE = 9;

type SortMode = "new" | "popular";
type SortDir = "desc" | "asc";

export function LibrarySearch({
  entries,
  topics,
  section = "life",
  cardLabel = "жизненная ситуация",
}: {
  entries: AnonymousLibraryEntry[];
  topics: string[];
  section?: LibrarySection;
  cardLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SortMode>("new");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query);

  // INC-080: тема раньше приходила с сервера из `?topic=`, и ровно это держало
  // `/library` в динамическом рендере — страницу нельзя было собрать заранее и
  // закешировать, хотя её содержимое от запроса не зависит.
  //
  // Почему НЕ `useSearchParams`: в статическом маршруте этот хук уводит всё
  // поддерево в клиентский рендер, и 150 карточек пропали бы из готового HTML —
  // то есть из выдачи. Читаем адрес после гидрации: робот получает ПОЛНЫЙ
  // список, человек по ссылке с темой видит фильтр сразу после гидрации.
  const [activeTopic, setActiveTopic] = useState<string | undefined>(undefined);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("topic");
    // Тот же разбор, что был на сервере: старые названия тем из разосланных
    // ссылок продолжают работать, мусор в параметре — игнорируется.
    const timer = window.setTimeout(() => {
      setActiveTopic(resolveLibraryTopic(raw ?? undefined));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  /**
   * Смена темы — без навигации: страница статическая, и router.push сюда
   * ничего нового не принесёт, а адрес мы всё равно обязаны обновить, чтобы
   * ссылкой на тему можно было поделиться.
   */
  const selectTopic = (topic?: string) => {
    setActiveTopic(topic);
    setPage(1);
    window.history.replaceState(null, "", filterHref(topic));
  };

  // Add a deterministic "freshness" rank so sort by "new" works without
  // a backend timestamp: entries near the start of the source array are
  // older, entries at the end are newer. `addedAt` is the same ordering
  // used by the catalogue, so the sort stays stable between renders.
  const sourceRanked = useMemo(
    () => entries.map((entry, index) => ({ entry, addedAt: index })),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return sourceRanked.filter(({ entry }) => {
      if (activeTopic && entry.topic !== activeTopic) return false;
      if (!q) return true;
      return (
        entry.question.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.topic.toLowerCase().includes(q)
      );
    });
  }, [sourceRanked, activeTopic, deferredQuery]);

  const sorted = useMemo(() => {
    const factor = dir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (mode === "popular") return factor * (a.entry.reactions - b.entry.reactions);
      return factor * (a.addedAt - b.addedAt);
    });
  }, [filtered, mode, dir]);

  // When the user is searching or filtering by topic, show every match
  // so they can scan the full result set. Otherwise keep the catalogue
  // light with a "Показать ещё" pagination cap (no numeric pages).
  const paginate = !deferredQuery.trim() && !activeTopic;
  const visibleCount = paginate ? Math.min(page * PAGE_SIZE, sorted.length) : sorted.length;
  const visible = sorted.slice(0, visibleCount);
  const hasMore = paginate && visibleCount < sorted.length;
  const filterHref = (topic?: string) => {
    const params = new URLSearchParams();
    if (section === "symbolic") params.set("section", "symbolic");
    if (topic) params.set("topic", topic);
    const queryString = params.toString();
    return queryString ? `/library?${queryString}` : "/library";
  };

  return (
    <>
      {/* Topic filter chips — v4 style row */}
      <nav className="soft-library-filter-row mb-6" aria-label="Фильтр тем">
        <button
          type="button"
          onClick={() => selectTopic(undefined)}
          className={`soft-chip ${!activeTopic && !query ? "soft-chip-warm" : ""}`}
        >
          Все
        </button>
        {topics.map((topic) => (
          <button
            key={topic}
            type="button"
            onClick={() => selectTopic(activeTopic === topic ? undefined : topic)}
            aria-pressed={activeTopic === topic}
            className={`soft-chip ${activeTopic === topic ? "soft-chip-warm" : ""}`}
          >
            {topic}
            {activeTopic === topic && <span style={{ opacity: 0.7, marginLeft: 4 }}>×</span>}
          </button>
        ))}
      </nav>

      {/* Visible search bar in v4.2 style with leading icon */}
      <div className="soft-card mb-6 flex items-center gap-3 px-4 py-3" data-testid="library-search">
        <Search className="size-5 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
          placeholder="Поиск по вопросам в библиотеке…"
          aria-label="Поиск вопросов в библиотеке"
          className="w-full bg-transparent text-base outline-none placeholder:text-[var(--soft-ink-faint)]"
          style={{ minHeight: 28 }}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setPage(1); }}
            className="soft-chip"
            style={{ padding: "4px 10px", fontSize: 12 }}
            aria-label="Очистить поиск"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Режим сортировки">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "new"}
            className={`soft-chip ${mode === "new" ? "soft-chip-warm" : ""}`}
            onClick={() => { setMode("new"); setPage(1); }}
          >
            Новые
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "popular"}
            className={`soft-chip ${mode === "popular" ? "soft-chip-warm" : ""}`}
            onClick={() => { setMode("popular"); setPage(1); }}
          >
            Популярные
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setDir(dir === "desc" ? "asc" : "desc"); setPage(1); }}
          className="soft-chip"
          aria-label="Сменить направление сортировки"
        >
          {dir === "desc" ? "по убыванию ↓" : "по возрастанию ↑"}
        </button>
      </div>

      <p className="mb-4 text-xs text-[var(--soft-ink-faint)]" aria-live="polite">
          {sorted.length}{" "}
          {sorted.length === 1 ? "вопрос" : sorted.length >= 2 && sorted.length <= 4 ? "вопроса" : "вопросов"}
      </p>

      {/* Results */}
      {sorted.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[var(--soft-ink-soft)]">Ничего не найдено по запросу «{query}».</p>
          <button className="soft-chip mt-4" onClick={() => setQuery("")}>
            Сбросить поиск
          </button>
        </div>
      ) : (
        <>
          <div className="soft-public-grid" data-testid="library-results">
            {visible.map(({ entry }) => (
              <Link
                key={entry.slug}
                href={`/library/${entry.slug}`}
                className="soft-card soft-library-card block"
                data-testid={`library-card-${entry.slug}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="soft-chip soft-chip-warm" style={{ fontSize: 13, padding: "4px 9px" }}>
                    {entry.topic}
                  </span>
                  <span className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>{cardLabel}</span>
                </div>
                <p className="soft-library-question mt-4">«{entry.question}»</p>
                <div
                  style={{
                    padding: "12px 0",
                    borderTop: "1px solid var(--soft-paper-edge)",
                    borderBottom: "1px solid var(--soft-paper-edge)",
                    margin: "12px 0",
                  }}
                >
                  <p className="soft-eyebrow mb-2">фрагмент разбора</p>
                  <p className="text-sm leading-relaxed" style={{ fontStyle: "italic", color: "var(--soft-ink-soft)" }}>
                    {entry.summary}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                    {entry.reactions.toLocaleString("ru-RU")} откликов по теме
                  </span>
                  <span className="soft-button soft-button-soft" style={{ fontSize: 12, padding: "5px 10px" }}>
                    Читать →
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                className="soft-button soft-button-ghost"
                data-testid="library-load-more"
              >
                Ещё
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
