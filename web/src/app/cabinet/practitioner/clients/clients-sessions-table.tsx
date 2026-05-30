"use client";

import { useMemo, useState } from "react";
import { getBookingStatus } from "@/lib/booking-status";
import { BookingActions } from "./booking-actions";

export interface SessionRow {
  id: string;
  clientName: string;
  clientEmail: string;
  status: string;
  startAt: string | null;
  priceRub: number;
  durationMinutes: number;
  startedAt: string | null;
}

type Category = "all" | "upcoming" | "completed" | "cancelled";
type SortMode = "nearest" | "time-asc" | "time-desc" | "price-asc" | "price-desc";

const PAGE_SIZE = 25;

const UPCOMING = new Set(["PENDING", "CONFIRMED", "IN_PROGRESS"]);
const COMPLETED = new Set(["COMPLETED", "DISPUTED"]);
const CANCELLED = new Set(["CANCELLED", "REFUNDED", "EXPIRED"]);

function categoryOf(status: string): Category {
  if (UPCOMING.has(status)) return "upcoming";
  if (COMPLETED.has(status)) return "completed";
  if (CANCELLED.has(status)) return "cancelled";
  return "completed";
}

const CATEGORY_TABS: Array<{ key: Category; label: string }> = [
  { key: "all", label: "Все" },
  { key: "upcoming", label: "Предстоящие" },
  { key: "completed", label: "Завершённые" },
  { key: "cancelled", label: "Отменённые" },
];

function localDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "без слота";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ClientsSessionsTable({ rows }: { rows: SessionRow[] }) {
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("nearest");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (category !== "all" && categoryOf(row.status) !== category) return false;
      if (q && !row.clientName.toLowerCase().includes(q) && !row.clientEmail.toLowerCase().includes(q)) return false;
      if (dateFilter && localDay(row.startAt) !== dateFilter) return false;
      return true;
    });

    const sorted = [...list].sort((a, b) => {
      const ta = a.startAt ? new Date(a.startAt).getTime() : null;
      const tb = b.startAt ? new Date(b.startAt).getTime() : null;
      if (sort === "price-asc") return a.priceRub - b.priceRub;
      if (sort === "price-desc") return b.priceRub - a.priceRub;
      // time-based: nulls always last
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      if (sort === "time-asc") return ta - tb;
      if (sort === "time-desc") return tb - ta;
      // nearest: closest to now first (upcoming and recent both bubble up)
      return Math.abs(ta - now) - Math.abs(tb - now);
    });
    return sorted;
  }, [rows, category, query, dateFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function changeFilters<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  function timeHeaderSort() {
    setSort((current) => (current === "time-asc" ? "time-desc" : current === "time-desc" ? "nearest" : "time-asc"));
  }
  function priceHeaderSort() {
    setSort((current) => (current === "price-asc" ? "price-desc" : "price-asc"));
  }

  const timeMark = sort === "time-asc" ? " ▲" : sort === "time-desc" ? " ▼" : sort === "nearest" ? " ◈" : "";
  const priceMark = sort === "price-asc" ? " ▲" : sort === "price-desc" ? " ▼" : "";

  return (
    <div data-testid="practitioner-sessions-table">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => changeFilters(setCategory, tab.key)}
            data-active={category === tab.key}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              category === tab.key
                ? "border-[var(--soft-bordeaux)] bg-[var(--soft-bordeaux)] text-[#fff8f1]"
                : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] text-[var(--soft-ink-soft)] hover:text-[var(--soft-ink)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => changeFilters(setQuery, event.target.value)}
          placeholder="Поиск по клиенту"
          aria-label="Поиск по клиенту"
          className="h-9 w-56 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 text-sm text-[var(--soft-ink)]"
        />
        <input
          type="date"
          value={dateFilter}
          onChange={(event) => changeFilters(setDateFilter, event.target.value)}
          aria-label="Фильтр по дате"
          className="h-9 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 text-sm text-[var(--soft-ink)]"
        />
        {(query || dateFilter || category !== "all" || sort !== "nearest") && (
          <button
            type="button"
            onClick={() => {
              setCategory("all");
              setQuery("");
              setDateFilter("");
              setSort("nearest");
              setPage(1);
            }}
            className="soft-chip"
          >
            Сбросить
          </button>
        )}
        <span className="ml-auto text-xs text-[var(--soft-ink-faint)]">{filtered.length} сессий</span>
      </div>

      <div className="overflow-x-auto rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)]">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-[var(--soft-surface)] text-left text-xs uppercase tracking-wide text-[var(--soft-ink-soft)]">
            <tr>
              <th className="px-3 py-2 font-semibold">Клиент</th>
              <th className="px-3 py-2 font-semibold">
                <button type="button" onClick={timeHeaderSort} className="cursor-pointer bg-transparent">
                  Дата и время{timeMark}
                </button>
              </th>
              <th className="px-3 py-2 font-semibold">Длительность</th>
              <th className="px-3 py-2 font-semibold">
                <button type="button" onClick={priceHeaderSort} className="cursor-pointer bg-transparent">
                  Стоимость{priceMark}
                </button>
              </th>
              <th className="px-3 py-2 font-semibold">Статус</th>
              <th className="px-3 py-2 font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">
                  Нет сессий в этой категории
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const st = getBookingStatus(row.status);
                const isUpcoming = UPCOMING.has(row.status);
                return (
                  <tr key={row.id} className="border-t border-[var(--soft-paper-edge)] hover:bg-[var(--soft-surface)]">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[var(--soft-ink)]">{row.clientName}</p>
                      <p className="text-xs text-[var(--soft-ink-faint)]">{row.clientEmail}</p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--soft-ink-soft)]">{formatWhen(row.startAt)}</td>
                    <td className="px-3 py-2.5 text-[var(--soft-ink-soft)]">{row.durationMinutes} мин</td>
                    <td className="px-3 py-2.5 font-medium text-[var(--soft-bordeaux)]">{row.priceRub.toLocaleString("ru-RU")} ₽</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {isUpcoming && row.status !== "PENDING" && (
                          <a href={`/session/${row.id}`} className="text-xs text-[var(--soft-bordeaux)] hover:underline">
                            Видеочат →
                          </a>
                        )}
                        <BookingActions
                          bookingId={row.id}
                          compact
                          status={row.status}
                          sessionStartedAt={row.startedAt ?? row.startAt ?? undefined}
                          durationMinutes={row.durationMinutes}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--soft-ink-faint)]">
          <button
            type="button"
            className="soft-chip disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            Назад
          </button>
          <span>
            {safePage} / {pageCount}
          </span>
          <button
            type="button"
            className="soft-chip disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage >= pageCount}
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
