"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { appUrl } from "@/lib/subdomain";

// B466 — клиентская часть списка «Клиенты»: поиск + attention-теги.

export interface ClientListRow {
  id: string;
  label: string;
  sessionsCount: number;
  sinceLabel: string;
  nextLabel: string | null;
  attention: "разбор" | "новый" | null;
}

function initialsOf(label: string): string {
  return label
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function ClientsListClient({ rows }: { rows: ClientListRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(q));
  }, [rows, query]);

  const attentionRows = filtered.filter((r) => r.attention);

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-clients-list">
      {/* Search */}
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--soft-ink-faint)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск клиента"
          className="soft-input h-11 w-full pl-10 text-base"
          data-testid="practitioner-clients-search"
        />
      </label>

      {/* Требуют внимания */}
      {attentionRows.length > 0 && !query && (
        <section>
          <p className="soft-eyebrow mb-2.5">Требуют внимания</p>
          <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
            {attentionRows.map((r) => (
              <Row key={`att-${r.id}`} row={r} />
            ))}
          </div>
        </section>
      )}

      {/* Все клиенты */}
      <section>
        <p className="soft-eyebrow mb-2.5">
          {query ? `Найдено · ${filtered.length}` : `Все клиенты · ${rows.length}`}
        </p>
        {filtered.length === 0 ? (
          <p className="soft-card p-5 text-sm text-[var(--soft-ink-faint)]">Никого не нашлось — проверьте запрос.</p>
        ) : (
          <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
            {filtered.map((r) => (
              <Row key={r.id} row={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ row }: { row: ClientListRow }) {
  return (
    <Link
      href={appUrl(`/practitioner/clients/${row.id}`)}
      className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
      data-testid="practitioner-client-row"
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
              style={row.attention === "разбор"
                ? { background: "var(--soft-amber-bg,#F2E2C2)", color: "var(--soft-amber-ink,#6E5114)" }
                : { background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}
            >
              {row.attention}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-faint)]">
          {row.sessionsCount > 0
            ? `${row.sessionsCount} ${row.sessionsCount === 1 ? "сессия" : row.sessionsCount < 5 ? "сессии" : "сессий"}`
            : "ещё не было сессий"}
          {` · клиент с ${row.sinceLabel}`}
          {row.nextLabel ? ` · следующая ${row.nextLabel}` : ""}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
    </Link>
  );
}
