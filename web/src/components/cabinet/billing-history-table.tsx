"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { getLedgerTypeLabel, humanizeBillingDescription } from "@/lib/billing-labels";

const PAGE_SIZE = 25;

interface BillingTransaction {
  id: string;
  amountRub: string | number;
  status: string;
  description: string | null;
  createdAt: string;
}

interface BillingLedgerEntry {
  id: string;
  amountRub: string | number;
  type: string;
  description: string | null;
  createdAt: string;
}

type Direction = "deposit" | "spend";

interface HistoryRow {
  id: string;
  label: string;
  amountRub: number;
  direction: Direction;
  status: string;
  createdAt: number;
}

type DirectionFilter = "all" | Direction;
type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

function statusLabel(status: string): string {
  switch (status) {
    case "SUCCEEDED":
      return "Оплачено";
    case "PENDING":
      return "В обработке";
    case "CANCELED":
    case "CANCELLED":
      return "Отменён";
    case "settled":
      return "Проведено";
    default:
      return status;
  }
}

/**
 * Unified money-movement history (deposits + spends) with client-side search,
 * direction filter, sort and 25-per-page pagination (T21). Settled balance
 * movements come from the RUB ledger; in-flight / failed top-ups are folded in
 * from the raw transactions so the user still sees pending payments.
 */
export function BillingHistoryTable({
  transactions,
  ledger,
}: {
  transactions: BillingTransaction[];
  ledger: BillingLedgerEntry[];
}) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [page, setPage] = useState(0);

  const rows = useMemo<HistoryRow[]>(() => {
    const ledgerRows: HistoryRow[] = ledger.map((entry) => {
      const amount = Number(entry.amountRub);
      return {
        id: `ledger-${entry.id}`,
        label: entry.description ? humanizeBillingDescription(entry.description) : getLedgerTypeLabel(entry.type),
        amountRub: amount,
        direction: amount >= 0 ? "deposit" : "spend",
        status: "settled",
        createdAt: new Date(entry.createdAt).getTime(),
      };
    });
    // Only surface transactions that the ledger does NOT already represent —
    // i.e. pending or failed top-ups (succeeded ones become ledger deposits).
    const pendingRows: HistoryRow[] = transactions
      .filter((t) => t.status !== "SUCCEEDED")
      .map((t) => ({
        id: `tx-${t.id}`,
        label: humanizeBillingDescription(t.description),
        amountRub: Math.abs(Number(t.amountRub)),
        direction: "deposit" as Direction,
        status: t.status,
        createdAt: new Date(t.createdAt).getTime(),
      }));
    return [...ledgerRows, ...pendingRows];
  }, [ledger, transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = rows.filter((row) => {
      if (direction !== "all" && row.direction !== direction) return false;
      if (q && !row.label.toLowerCase().includes(q)) return false;
      return true;
    });
    result.sort((a, b) => {
      switch (sort) {
        case "date_asc":
          return a.createdAt - b.createdAt;
        case "amount_desc":
          return Math.abs(b.amountRub) - Math.abs(a.amountRub);
        case "amount_asc":
          return Math.abs(a.amountRub) - Math.abs(b.amountRub);
        case "date_desc":
        default:
          return b.createdAt - a.createdAt;
      }
    });
    return result;
  }, [rows, query, direction, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const directionFilters: Array<{ key: DirectionFilter; label: string }> = [
    { key: "all", label: "Все" },
    { key: "deposit", label: "Пополнения" },
    { key: "spend", label: "Списания" },
  ];

  return (
    <div data-testid="client-billing-history-table">
      {/* G15: one compact toolbar — small search, an inline segmented direction
          filter, and a small sort select — instead of the previous oversized
          two-row control block. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[150px] flex-1 sm:max-w-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--soft-ink-faint)]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            placeholder="Поиск"
            className="soft-input h-9 w-full pl-8 text-sm"
            data-testid="billing-history-search"
            aria-label="Поиск по истории платежей"
          />
        </div>
        <div
          className="inline-flex shrink-0 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-0.5"
          role="group"
          aria-label="Фильтр по типу операции"
        >
          {directionFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setDirection(f.key); setPage(0); }}
              aria-pressed={direction === f.key}
              className={
                direction === f.key
                  ? "rounded-full bg-[var(--soft-bordeaux)] px-3 py-1 text-xs font-semibold text-white transition-colors"
                  : "rounded-full px-3 py-1 text-xs font-medium text-[var(--soft-ink-soft)] transition-colors hover:text-[var(--soft-bordeaux)]"
              }
              data-testid={`billing-history-filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as SortKey); setPage(0); }}
          className="soft-input h-9 shrink-0 text-sm"
          data-testid="billing-history-sort"
          aria-label="Сортировка истории платежей"
        >
          <option value="date_desc">Сначала новые</option>
          <option value="date_asc">Сначала старые</option>
          <option value="amount_desc">Сумма ↓</option>
          <option value="amount_asc">Сумма ↑</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--soft-ink-faint)]">
          <p>Операций пока нет</p>
          <p className="mt-1 text-xs">Здесь будут отображаться ваши пополнения и списания</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="billing-history-rows">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--soft-ink-faint)]">
                  <th className="py-2 pr-3 font-medium">Операция</th>
                  <th className="py-2 pr-3 font-medium">Дата</th>
                  <th className="py-2 pr-3 font-medium">Статус</th>
                  <th className="py-2 text-right font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--soft-paper-edge)]">
                    <td className="py-3 pr-3">
                      {/* G15: a small colored dot + the colored +/− amount carry
                          direction — clearer than the previous up/down arrows,
                          which clients read as sort controls, not money flow. */}
                      <span className="inline-flex items-center gap-2.5 font-medium text-[var(--soft-ink)]">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: row.direction === "deposit" ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)" }}
                          aria-hidden="true"
                        />
                        {row.label}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-[var(--soft-ink-faint)]">
                      {new Date(row.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="soft-badge" style={{ fontSize: 11 }}>{statusLabel(row.status)}</span>
                    </td>
                    <td className="py-3 text-right font-heading font-semibold" style={{ color: row.direction === "deposit" ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)" }}>
                      {row.amountRub >= 0 ? "+" : "−"}{Math.abs(row.amountRub).toFixed(2)} ₽
                    </td>
                  </tr>
                ))}
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
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="soft-chip disabled:opacity-40"
                  aria-label="Предыдущая страница"
                >
                  <ChevronLeft className="size-3.5" aria-hidden="true" />
                </button>
                <span>{safePage + 1} / {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="soft-chip disabled:opacity-40"
                  aria-label="Следующая страница"
                >
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
