"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { appUrl } from "@/lib/subdomain";
import type { ClientListRow } from "./clients-list-client";

// B466 R9-4 P2 — интерактивный остров списка «Клиенты» (mockup
// practitioner-clients-list.html): поиск по имени + фильтр-чипы Все/Активные/
// Новые + список pcab-cl с attention-тегами. Разметка/цвета 1-в-1 из макета;
// данные — те же серверные ClientListRow, что и десктоп (без дублей выборок).
// Локальный initialsOf — чтобы не тянуть серверный practitioner-appbar
// (db-импорт) в клиентский бандл.

type Filter = "all" | "active" | "new";

function initialsOf(label: string): string {
  return (
    label
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function pluralSessions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "сессия";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "сессии";
  return "сессий";
}

/** Подпись строки клиента из реальных данных (в стиле однострочника макета). */
function metaFor(row: ClientListRow): string {
  if (row.nextLabel) {
    return row.sessionsCount > 0
      ? `ближайшая — ${row.nextLabel} · ${row.sessionsCount + 1}-я`
      : `первая сессия — ${row.nextLabel}`;
  }
  return row.sessionsCount > 0
    ? `${row.sessionsCount} ${pluralSessions(row.sessionsCount)} · клиент с ${row.sinceLabel}`
    : `новый клиент · с ${row.sinceLabel}`;
}

export function ClientsMobileList({ rows }: { rows: ClientListRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const activeCount = rows.filter((r) => r.nextLabel).length;
  const newCount = rows.filter((r) => r.attention === "новый").length;
  const attentionCount = rows.filter((r) => r.attention).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.label.toLowerCase().includes(q)) return false;
      if (filter === "active" && !r.nextLabel) return false;
      if (filter === "new" && r.attention !== "новый") return false;
      return true;
    });
  }, [rows, query, filter]);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: `Все · ${rows.length}` },
    { key: "active", label: `Активные · ${activeCount}` },
    { key: "new", label: `Новые · ${newCount}` },
  ];

  const showNote = attentionCount > 0 && filter === "all" && !query.trim();

  return (
    <>
      <label className="pcab-search">
        <Search width={16} height={16} strokeWidth={1.9} aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени"
          aria-label="Поиск по имени"
          data-testid="practitioner-clients-search"
        />
      </label>

      <div className="pcab-chips" role="group" aria-label="Фильтр клиентов">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`pcab-chip${filter === c.key ? " is-active" : ""}`}
            aria-pressed={filter === c.key}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {showNote && <div className="pcab-listnote">Требуют внимания — {attentionCount}</div>}

      {filtered.length === 0 ? (
        <div
          className="pcab-listnote"
          style={{ marginTop: 16 }}
          data-testid="practitioner-clients-none"
        >
          Никого не нашлось — измените запрос или фильтр.
        </div>
      ) : (
        <div
          className="pcab-list"
          style={{ marginTop: showNote ? 0 : 16 }}
          data-testid="practitioner-clients-list-mobile"
        >
          {filtered.map((row) => (
            <Link
              key={row.id}
              href={appUrl(`/practitioner/clients/${row.id}`)}
              className="pcab-cl"
              data-testid="practitioner-client-row-mobile"
            >
              <div className="pcab-cl-av" aria-hidden="true">
                {initialsOf(row.label)}
              </div>
              <div className="pcab-cl-main">
                <div className="pcab-cl-name">{row.label}</div>
                <div className="pcab-cl-meta">{metaFor(row)}</div>
              </div>
              <div className="pcab-cl-right">
                {row.attention && (
                  <span className={`pcab-cl-tag ${row.attention === "разбор" ? "amber" : "new"}`}>
                    {row.attention === "разбор" ? "разбор готов" : "новый"}
                  </span>
                )}
                <ChevronRight className="pcab-chev" width={18} height={18} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
