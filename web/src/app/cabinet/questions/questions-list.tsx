"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Trash2 } from "lucide-react";

export type QuestionItem = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  topic: string;
  topicLabel: string;
  href: string;
  updatedAtMs: number;
  updatedLabel: string;
  messages: number;
  productResults: number;
  clarityRoutes: number;
};

const PAGE_SIZE = 5;

type SortKey = "newest" | "oldest";

export function QuestionsList({
  items,
  deleteAction,
}: {
  items: QuestionItem[];
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);

  // Distinct status/topic options derived from the data (label + raw value).
  const statusOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.status, item.statusLabel);
    return Array.from(map, ([value, label]) => ({ value, label }));
  }, [items]);

  const topicOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.topic, item.topicLabel);
    return Array.from(map, ([value, label]) => ({ value, label }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (topicFilter !== "all" && item.topic !== topicFilter) return false;
      if (q && !item.title.toLowerCase().includes(q)) return false;
      return true;
    });
    result.sort((a, b) =>
      sort === "newest" ? b.updatedAtMs - a.updatedAtMs : a.updatedAtMs - b.updatedAtMs,
    );
    return result;
  }, [items, query, statusFilter, topicFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  // Any control change resets to page 1.
  const resetPage = () => setPage(1);

  return (
    <div data-testid="questions-list">
      {/* Controls + top pagination */}
      <div className="soft-card mb-4 flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--soft-ink-faint)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); resetPage(); }}
              placeholder="Поиск по вопросам"
              className="soft-input w-full pl-9"
              aria-label="Поиск по вопросам"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}
            className="soft-input md:w-48"
            aria-label="Фильтр по статусу"
          >
            <option value="all">Все статусы</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={topicFilter}
            onChange={(e) => { setTopicFilter(e.target.value); resetPage(); }}
            className="soft-input md:w-44"
            aria-label="Фильтр по теме"
          >
            <option value="all">Все темы</option>
            {topicOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value as SortKey); resetPage(); }}
            className="soft-input md:w-44"
            aria-label="Сортировка"
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm text-[var(--soft-ink-faint)]">
          <span>
            {filtered.length === 0
              ? "Ничего не найдено"
              : `Показаны ${start + 1}–${start + visible.length} из ${filtered.length}`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="soft-button soft-button-ghost disabled:opacity-40"
                style={{ minHeight: "2rem", padding: "0.25rem 0.6rem" }}
                aria-label="Предыдущая страница"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular-nums">{safePage} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="soft-button soft-button-ghost disabled:opacity-40"
                style={{ minHeight: "2rem", padding: "0.25rem 0.6rem" }}
                aria-label="Следующая страница"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {visible.map((item) => (
          <article key={item.id} className="soft-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="soft-chip soft-chip-warm">{item.statusLabel}</span>
                <span className="soft-chip">{item.topicLabel}</span>
              </div>
              <h2 className="mt-3 font-heading text-2xl font-medium text-[var(--soft-ink)]">
                {item.title}
              </h2>
              <p className="mt-2 text-sm text-[var(--soft-ink-faint)]">
                Обновлено {item.updatedLabel}
                {" · "}
                {item.messages} сообщений
                {item.productResults > 0 && ` · ${item.productResults} результатов`}
                {item.clarityRoutes > 0 && ` · ${item.clarityRoutes} маршрутов`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href={item.href} className="soft-button soft-button-ghost">
                Открыть
              </Link>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="soft-button soft-button-ghost text-[var(--soft-bordeaux)]">
                  <Trash2 className="size-4" />
                  Удалить
                </button>
              </form>
            </div>
          </article>
        ))}
      </div>

      {/* "Ещё" load-more — advances to the next page */}
      {safePage < totalPages && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="soft-button soft-button-ghost"
          >
            Ещё
          </button>
        </div>
      )}
    </div>
  );
}
