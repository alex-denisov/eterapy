"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

const PAGE_SIZE = 25;

export interface EarningsMovementRow {
  id: string;
  kind: "earning" | "payout";
  dateIso: string;
  amountRub: number;
  label: string;
  sublabel: string;
  status: string;
}

type KindFilter = "all" | EarningsMovementRow["kind"];
type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

function kindLabel(kind: EarningsMovementRow["kind"]) {
  return kind === "earning" ? "Зачисление" : "Выплата";
}

function statusTone(status: string) {
  if (status === "COMPLETED" || status === "DONE") return "ok";
  if (status === "FAILED") return "danger";
  return "warn";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function EarningsMovementsTable({ rows }: { rows: EarningsMovementRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = rows.filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (q && !`${row.label} ${row.sublabel} ${row.status}`.toLowerCase().includes(q)) return false;
      return true;
    });
    result.sort((a, b) => {
      switch (sort) {
        case "date_asc":
          return new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime();
        case "amount_desc":
          return Math.abs(b.amountRub) - Math.abs(a.amountRub);
        case "amount_asc":
          return Math.abs(a.amountRub) - Math.abs(b.amountRub);
        case "date_desc":
        default:
          return new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime();
      }
    });
    return result;
  }, [kind, query, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const filters: Array<{ key: KindFilter; label: string }> = [
    { key: "all", label: "Все" },
    { key: "earning", label: "Зачисления" },
    { key: "payout", label: "Выплаты" },
  ];

  if (rows.length === 0) {
    return (
      <div className="soft-card p-8 text-center text-sm text-[var(--soft-ink-soft)]">
        Нет движений. Доход появится после первой завершённой сессии.
      </div>
    );
  }

  return (
    <div className="soft-card p-4" data-testid="practitioner-earnings-movements-table">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1 sm:max-w-[260px]">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--soft-ink-faint)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Поиск"
            className="soft-input h-9 w-full pl-8 text-sm"
            aria-label="Поиск по движению средств"
            data-testid="practitioner-earnings-search"
          />
        </div>
        <div
          className="inline-flex shrink-0 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-0.5"
          role="group"
          aria-label="Фильтр движения средств"
        >
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => {
                setKind(filter.key);
                setPage(0);
              }}
              aria-pressed={kind === filter.key}
              className={
                kind === filter.key
                  ? "rounded-full bg-[var(--soft-bordeaux)] px-3 py-1 text-xs font-semibold text-white transition-colors"
                  : "rounded-full px-3 py-1 text-xs font-medium text-[var(--soft-ink-soft)] transition-colors hover:text-[var(--soft-bordeaux)]"
              }
              data-testid={`practitioner-earnings-filter-${filter.key}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as SortKey);
            setPage(0);
          }}
          className="soft-input h-9 shrink-0 text-sm"
          aria-label="Сортировка движения средств"
          data-testid="practitioner-earnings-sort"
        >
          <option value="date_desc">Сначала новые</option>
          <option value="date_asc">Сначала старые</option>
          <option value="amount_desc">Сумма ↓</option>
          <option value="amount_asc">Сумма ↑</option>
        </select>
      </div>

      {/* B462 §4.1: real tables feel cramped on mobile — below sm: the movements
          render as stacked list-cards (no horizontal scroll). The table is kept
          from sm: up where there is room for five columns. */}
      <ul className="space-y-2 sm:hidden" data-testid="practitioner-earnings-cards">
        {pageRows.map((row) => {
          const isEarning = row.kind === "earning";
          return (
            <li
              key={row.id}
              className="rounded-[var(--soft-radius-md)] border border-[var(--soft-paper-edge)] p-3"
              data-testid="practitioner-earnings-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-[var(--soft-ink)]">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: isEarning ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)" }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 truncate">{row.label}</span>
                  </p>
                  {row.sublabel && (
                    <p className="mt-0.5 truncate text-xs text-[var(--soft-ink-faint)]">{row.sublabel}</p>
                  )}
                </div>
                <span
                  className="shrink-0 whitespace-nowrap font-heading font-semibold tabular-nums"
                  style={{ color: isEarning ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)" }}
                >
                  {isEarning ? "+" : "−"}{Math.abs(row.amountRub).toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--soft-ink-soft)]">
                <span>{kindLabel(row.kind)} · {formatDate(row.dateIso)}</span>
                <span className="soft-admin-status-pill" data-tone={statusTone(row.status)}>
                  {row.status}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm" data-testid="practitioner-earnings-rows">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--soft-ink-faint)]">
              <th className="py-2 pr-3 font-medium">Операция</th>
              <th className="py-2 pr-3 font-medium">Дата</th>
              <th className="py-2 pr-3 font-medium">Тип</th>
              <th className="py-2 pr-3 font-medium">Статус</th>
              <th className="py-2 text-right font-medium">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const isEarning = row.kind === "earning";
              return (
                <tr key={row.id} className="border-t border-[var(--soft-paper-edge)]">
                  <td className="py-3 pr-3">
                    <span className="inline-flex items-center gap-2.5 font-medium text-[var(--soft-ink)]">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: isEarning ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)" }}
                        aria-hidden="true"
                      />
                      <span>
                        {row.label}
                        <span className="block text-xs font-normal text-[var(--soft-ink-faint)]">{row.sublabel}</span>
                      </span>
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-[var(--soft-ink-faint)]">{formatDate(row.dateIso)}</td>
                  <td className="py-3 pr-3 text-[var(--soft-ink-soft)]">{kindLabel(row.kind)}</td>
                  <td className="py-3 pr-3">
                    <span className="soft-admin-status-pill" data-tone={statusTone(row.status)}>
                      {row.status}
                    </span>
                  </td>
                  <td
                    className="whitespace-nowrap py-3 text-right font-heading font-semibold tabular-nums"
                    style={{ color: isEarning ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)" }}
                  >
                    {isEarning ? "+" : "−"}{Math.abs(row.amountRub).toLocaleString("ru-RU")} ₽
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-[var(--soft-ink-faint)]">
          <span>
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} из {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={safePage === 0}
              className="soft-chip disabled:opacity-40"
              aria-label="Предыдущая страница"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </button>
            <span>{safePage + 1} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={safePage >= pageCount - 1}
              className="soft-chip disabled:opacity-40"
              aria-label="Следующая страница"
            >
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
