"use client";

import { useState, useDeferredValue } from "react";
import Link from "next/link";
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
      {/* Topic filter chips — v4 style row */}
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
            {activeTopic === topic && <span style={{ opacity: 0.7, marginLeft: 4 }}>×</span>}
          </Link>
        ))}
      </nav>

      {/* Inline search — minimal, matches ask-input aesthetic */}
      <div className="mb-8">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по вопросам…"
          aria-label="Поиск вопросов в библиотеке"
          className="soft-question-input"
          style={{ minHeight: 44, fontSize: 15 }}
        />
        {query && (
          <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
            {filtered.length}{" "}
            {filtered.length === 1 ? "вопрос" : filtered.length >= 2 && filtered.length <= 4 ? "вопроса" : "вопросов"}
          </p>
        )}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[var(--soft-ink-soft)]">Ничего не найдено по запросу «{query}».</p>
          <button className="soft-chip mt-4" onClick={() => setQuery("")}>
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
                <span className="soft-chip soft-chip-warm" style={{ fontSize: 13, padding: "4px 9px" }}>
                  {entry.topic}
                </span>
                <span className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>анонимно</span>
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
                  {entry.reactions} прошли разбор
                </span>
                <span className="soft-button soft-button-soft" style={{ fontSize: 12, padding: "5px 10px" }}>
                  Похожий разбор →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
