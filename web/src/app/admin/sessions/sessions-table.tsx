"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  CompactHeader,
  CompactPaginationBar,
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_INPUT_CLASS,
  type SortDirection,
} from "@/components/admin/compact-table";

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

const PAGE_SIZE = 20;

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
  const activeSortKey = sort.startsWith("duration") ? "duration" : "date";
  const sortDirection: SortDirection = sort.endsWith("asc") ? "asc" : "desc";

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
          className={`${COMPACT_INPUT_CLASS} ml-auto w-60 rounded border border-[var(--soft-paper-edge)]`}
        />
      </div>

      <CompactTableShell minWidth="900px">
          <thead>
            <tr>
              <CompactHeader label="Клиент → Практик" />
              <CompactHeader label="Статус" />
              <CompactHeader label="Комната" />
              <CompactHeader
                label={`Длительность${durationMark}`}
                sortKey="duration"
                activeSortKey={activeSortKey}
                direction={sortDirection}
                onSort={durationSort}
              />
              <CompactHeader
                label={`Дата${dateMark}`}
                sortKey="date"
                activeSortKey={activeSortKey}
                direction={sortDirection}
                onSort={dateSort}
              />
              <CompactHeader label="Запись" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className={`${COMPACT_CELL_CLASS} py-10 text-center text-[var(--soft-ink-soft)]`}>
                  Нет видеосессий
                </td>
              </tr>
            ) : (
              visible.map((s) => {
                const meta = STATUS_META[s.status] ?? { label: s.status, tone: "muted" };
                return (
                  <tr key={s.id}>
                    <td className={COMPACT_CELL_CLASS}>
                      <p className="font-medium text-[var(--soft-ink)]">{s.clientName}</p>
                      <p className="text-xs text-[var(--soft-ink-faint)]">→ {s.practitionerName}</p>
                    </td>
                    <td className={COMPACT_CELL_CLASS}>
                      <span className="soft-admin-status-pill" data-tone={meta.tone}>{meta.label}</span>
                    </td>
                    <td className={COMPACT_CELL_CLASS}>
                      <code className="text-xs text-[var(--soft-ink-soft)]">{s.roomName.slice(0, 20)}…</code>
                    </td>
                    <td className={`${COMPACT_CELL_CLASS} text-[var(--soft-ink-soft)]`}>{s.durationMin !== null ? `${s.durationMin} мин` : "—"}</td>
                    <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap text-[var(--soft-ink-soft)]`}>
                      {new Date(s.createdAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td className={COMPACT_CELL_CLASS}>
                      {s.recordingUrl ? (
                        <div className="inline-flex flex-col items-end gap-1">
                          <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer" className="soft-admin-icon-button" title="Скачать запись" aria-label="Скачать запись">
                            <Download className="size-3.5" aria-hidden="true" />
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
      </CompactTableShell>

      {pageCount > 1 && (
        <CompactPaginationBar page={safePage} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </div>
  );
}
