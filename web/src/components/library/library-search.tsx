"use client";

import { useState, useDeferredValue } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { AnonymousLibraryEntry } from "@/data/anonymous-library";

export function LibrarySearch({
  entries,
  topics,
  activeTopic,
}: {
  entries: AnonymousLibraryEntry[];
  topics: string[];
  activeTopic?: string;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filtered = entries.filter((e) => {
    if (activeTopic && e.topic !== activeTopic) return false;
    if (!deferredQuery.trim()) return true;
    const q = deferredQuery.toLowerCase();
    return (
      e.question.toLowerCase().includes(q) ||
      e.summary.toLowerCase().includes(q) ||
      e.topic.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Search input */}
      <div className="relative mb-6 mt-2">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--soft-ink-faint)]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по вопросам…"
          aria-label="Поиск вопросов в библиотеке"
          className="w-full rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] py-2.5 pl-11 pr-4 text-sm outline-none transition-colors placeholder:text-[var(--soft-ink-faint)] focus:border-[var(--soft-terracotta)] focus:ring-1 focus:ring-[var(--soft-terracotta)]"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--soft-ink-faint)]">
          {filtered.length} {filtered.length === 1 ? "вопрос" : filtered.length >= 2 && filtered.length <= 4 ? "вопроса" : "вопросов"}
        </span>
      </div>

      {/* Topic filter chips */}
      <nav className="soft-library-filter-row mb-6" aria-label="Фильтр тем">
        <Link href="/library" className={`soft-chip ${!activeTopic && !query ? "soft-chip-warm" : ""}`}>
          Все
        </Link>
        {topics.map((topic) => (
          <Link
            key={topic}
            href={`/library?topic=${encodeURIComponent(topic)}`}
            className={`soft-chip ${activeTopic === topic ? "soft-chip-warm" : ""}`}
          >
            {topic}
          </Link>
        ))}
      </nav>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[var(--soft-ink-soft)]">Ничего не найдено по запросу «{query}».</p>
          <button
            className="soft-chip mt-4"
            onClick={() => setQuery("")}
          >
            Сбросить поиск
          </button>
        </div>
      ) : (
        <div className="soft-public-grid">
          {filtered.map((entry) => (
            <Link
              key={entry.slug}
              href={`/library/${entry.slug}`}
              className="soft-card soft-library-card block"
              data-testid={`library-card-${entry.slug}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="soft-chip soft-chip-warm">{entry.topic}</span>
                <span className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>анонимно</span>
              </div>
              <p className="soft-library-question mt-4">«{entry.question}»</p>
              <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                {entry.summary}
              </p>
              <div className="mt-4 flex items-center gap-3 text-xs text-[var(--soft-ink-faint)]">
                <span>{entry.reactions} отзывов</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
