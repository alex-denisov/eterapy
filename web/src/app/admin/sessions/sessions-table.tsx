"use client";

import { useMemo, useState } from "react";

export interface VideoSessionRow {
  id: string;
  clientName: string;
  clientEmail: string;
  practitionerName: string;
  status: string;
  roomName: string;
  durationMin: number | null;
  createdAt: string;
  recordingUrl: string | null;
  recordingExpiry: string | null;
}

const PAGE_SIZE = 25;

const STATUS_META: Record<string, { label: string; tone: string }> = {
  WAITING: { label: "Ожидание", tone: "warn" },
  ACTIVE: { label: "Активна", tone: "ok" },
  RECORDING: { label: "Запись", tone: "ok" },
  ENDED: { label: "Завершена", tone: "" },
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "Все" },
  { key: "ACTIVE", label: "Активные" },
  { key: "RECORDING", label: "Запись" },
  { key: "WAITING", label: "Ожидание" },
  { key: "ENDED", label: "Завершённые" },
];

type SortMode = "date-desc" | "date-asc" | "duration-desc" | "duration-asc";

export function SessionsTable({ rows }: { rows: VideoSessionRow[] }) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("date-desc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (q && !row.clientName.toLowerCase().includes(q) && !row.clientEmail.toLowerCase().includes(q) && !row.practitionerName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "duration-asc") return (a.durationMin ?? -1) - (b.durationMin ?? -1);
      if (sort === "duration-desc") return (b.durationMin ?? -1) - (a.durationMin ?? -1);
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sort === "date-asc" ? ta - tb : tb - ta;
    });
  }, [rows, status, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function dateSort() {
    setSort((cur) => (cur === "date-desc" ? "date-asc" : "date-desc"));
  }
  function durationSort() {
    setSort((cur) => (cur === "duration-desc" ? "duration-asc" : "duration-desc"));
  }
  const dateMark = sort === "date-desc" ? " ▼" : sort === "date-asc" ? " ▲" : "";
  const durationMark = sort === "duration-desc" ? " ▼" : sort === "duration-asc" ? " ▲" : "";

  return (
    <div data-testid="admin-sessions-table">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setStatus(tab.key);
              setPage(1);
            }}
            data-active={status === tab.key}
            className="soft-admin-seg-btn"
          >
            {tab.label}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Поиск: клиент или практик"
          aria-label="Поиск по сессиям"
          className="soft-admin-table-filter mt-0 ml-auto h-8 w-60"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="soft-admin-data-table min-w-[900px]">
          <thead>
            <tr>
              <th>Клиент → Практик</th>
              <th>Статус</th>
              <th>Комната</th>
              <th>
                <button type="button" className="cursor-pointer bg-transparent" onClick={durationSort}>
                  Длительность{durationMark}
                </button>
              </th>
              <th>
                <button type="button" className="cursor-pointer bg-transparent" onClick={dateSort}>
                  Дата{dateMark}
                </button>
              </th>
              <th>Запись</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[var(--soft-ink-soft)]">
                  Нет видеосессий
                </td>
              </tr>
            ) : (
              visible.map((s) => {
                const meta = STATUS_META[s.status] ?? { label: s.status, tone: "muted" };
                return (
                  <tr key={s.id}>
                    <td>
                      <p className="font-medium text-[var(--soft-ink)]">{s.clientName}</p>
                      <p className="text-xs text-[var(--soft-ink-faint)]">→ {s.practitionerName}</p>
                    </td>
                    <td>
                      <span className="soft-admin-status-pill" data-tone={meta.tone}>{meta.label}</span>
                    </td>
                    <td>
                      <code className="text-xs text-[var(--soft-ink-soft)]">{s.roomName.slice(0, 20)}…</code>
                    </td>
                    <td className="text-[var(--soft-ink-soft)]">{s.durationMin !== null ? `${s.durationMin} мин` : "—"}</td>
                    <td className="whitespace-nowrap text-[var(--soft-ink-soft)]">
                      {new Date(s.createdAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td>
                      {s.recordingUrl ? (
                        <div>
                          <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--soft-bordeaux)] hover:underline">
                            ⬇ Скачать
                          </a>
                          {s.recordingExpiry && (
                            <p className="text-[10px] text-[var(--soft-ink-faint)]">
                              до {new Date(s.recordingExpiry).toLocaleDateString("ru-RU")}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--soft-ink-faint)]">—</span>
                      )}
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
          <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
            Назад
          </button>
          <span>{safePage} / {pageCount}</span>
          <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}>
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
