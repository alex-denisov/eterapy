"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { appUrl } from "@/lib/subdomain";
import type { ClientListRow } from "./clients-list-client";

// B466 R9-5 — левая панель мастер-детейла «Клиенты» (mockup
// practitioner-desktop-clients-v2): поиск + фильтр-чипы + список, строка ведёт
// в `?client=<id>` (сервер перерисовывает правую карточку). Выбранная строка
// подсвечена. Правая карточка рендерится сервером (переиспользует CardOverview
// и др.), поэтому список — единственная клиентская часть.

type FilterKey = "all" | "active" | "new" | "attention";

function initialsOf(label: string): string {
  return (
    label
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function statusLine(row: ClientListRow): string {
  const sessions =
    row.sessionsCount > 0
      ? `${row.sessionsCount} ${row.sessionsCount === 1 ? "сессия" : row.sessionsCount < 5 ? "сессии" : "сессий"}`
      : "ещё не было сессий";
  const next = row.nextLabel ? ` · ближайшая ${row.nextLabel}` : "";
  return `${sessions}${next}`;
}

export function ClientsMasterListDesktop({
  rows,
  selectedId,
}: {
  rows: ClientListRow[];
  selectedId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.sessionsCount > 0 || r.nextLabel).length,
      new: rows.filter((r) => r.attention === "новый").length,
      attention: rows.filter((r) => r.attention).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.label.toLowerCase().includes(q)) return false;
      if (filter === "active") return r.sessionsCount > 0 || !!r.nextLabel;
      if (filter === "new") return r.attention === "новый";
      if (filter === "attention") return !!r.attention;
      return true;
    });
  }, [rows, query, filter]);

  const chips: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "all", label: "Все", count: counts.all },
    { key: "active", label: "Активные", count: counts.active },
    { key: "new", label: "Новые", count: counts.new },
    { key: "attention", label: "Требуют внимания", count: counts.attention },
  ];

  return (
    <div className="soft-card flex flex-col gap-3.5 p-4" data-testid="practitioner-clients-list">
      {/* Search */}
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--soft-ink-faint)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени"
          className="soft-input h-11 w-full pl-10 text-[15px]"
          data-testid="practitioner-clients-search"
        />
      </label>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5" data-testid="practitioner-clients-filters">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            aria-pressed={filter === c.key}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              filter === c.key
                ? "bg-[#F3E7DD] text-[var(--soft-bordeaux)]"
                : "bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)] hover:text-foreground"
            }`}
          >
            {c.label} · {c.count}
          </button>
        ))}
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-[var(--soft-ink-faint)]">
          Никого не нашлось — измените запрос или фильтр.
        </p>
      ) : (
        <div className="-mx-1 flex flex-col">
          {filtered.map((row) => {
            const isSelected = row.id === selectedId;
            return (
              <Link
                key={row.id}
                href={appUrl(`/practitioner/clients?client=${row.id}`)}
                scroll={false}
                data-testid="practitioner-client-row"
                aria-current={isSelected ? "true" : undefined}
                className={`flex items-center gap-3 rounded-[14px] px-3 py-2.5 transition-colors ${
                  isSelected
                    ? "bg-[#F6ECE4] shadow-[inset_3px_0_0_var(--soft-terracotta)]"
                    : "hover:bg-[var(--soft-paper-deep)]/50"
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--soft-paper-deep)] text-[13px] font-semibold text-[var(--soft-bordeaux)]">
                  {initialsOf(row.label)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-medium">{row.label}</span>
                    {row.attention && (
                      <span
                        className="shrink-0 rounded-md px-1.5 py-px text-[10px] font-semibold"
                        style={
                          row.attention === "разбор"
                            ? { background: "var(--soft-amber-bg,#F2E2C2)", color: "var(--soft-amber-ink,#6E5114)" }
                            : { background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }
                        }
                      >
                        {row.attention === "разбор" ? "разбор готов" : "новый"}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-faint)]">
                    {statusLine(row)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
