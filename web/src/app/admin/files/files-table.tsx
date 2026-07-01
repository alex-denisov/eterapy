"use client";

import { useMemo, useState } from "react";
import {
  CompactHeader,
  CompactPaginationBar,
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_INPUT_CLASS,
  COMPACT_SELECT_CLASS,
} from "@/components/admin/compact-table";

export interface StoredFileRow {
  id: string;
  originalName: string;
  mimeType: string;
  path: string;
  kind: string;
  userName: string;
  userEmail: string;
  sizeBytes: number;
  createdAt: string;
}

const PAGE_SIZE = 25;

type SortMode = "date-desc" | "date-asc" | "size-desc" | "size-asc";

function kindClass(kind: string): string {
  if (kind === "AVATAR") return "bg-primary/10 text-primary";
  if (kind === "DOCUMENT") return "bg-blue-500/10 text-blue-400";
  return "bg-purple-500/10 text-purple-400";
}

export function FilesTable({ rows }: { rows: StoredFileRow[] }) {
  const [filters, setFilters] = useState({ file: "", kind: "all", user: "", size: "", createdAt: "" });
  const [sort, setSort] = useState<SortMode>("date-desc");
  const [page, setPage] = useState(1);

  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.kind))).sort(), [rows]);

  const filtered = useMemo(() => {
    const list = rows.filter((row) => {
      if (filters.kind !== "all" && row.kind !== filters.kind) return false;
      return [
        [filters.file, `${row.originalName} ${row.mimeType}`],
        [filters.user, `${row.userName} ${row.userEmail}`],
        [filters.size, `${Math.round(row.sizeBytes / 1024)}`],
        [filters.createdAt, new Date(row.createdAt).toLocaleDateString("ru-RU")],
      ].every(([filter, value]) => !filter || value.toLowerCase().includes(filter.toLowerCase()));
    });
    return [...list].sort((a, b) => {
      if (sort === "size-asc") return a.sizeBytes - b.sizeBytes;
      if (sort === "size-desc") return b.sizeBytes - a.sizeBytes;
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sort === "date-asc" ? ta - tb : tb - ta;
    });
  }, [rows, filters, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const dateMark = sort === "date-desc" ? " ▼" : sort === "date-asc" ? " ▲" : "";
  const sizeMark = sort === "size-desc" ? " ▼" : sort === "size-asc" ? " ▲" : "";

  return (
    <div data-testid="admin-files-table">
      <CompactTableShell minWidth="820px">
          <thead>
            <tr>
              <CompactHeader label="Файл">
                <HeaderTextFilter value={filters.file} placeholder="файл/mime" onChange={(value) => { setFilters((current) => ({ ...current, file: value })); setPage(1); }} />
              </CompactHeader>
              <CompactHeader label="Тип">
                <div className="p-1 pt-0">
                  <select className={COMPACT_SELECT_CLASS} value={filters.kind} onChange={(event) => { setFilters((current) => ({ ...current, kind: event.target.value })); setPage(1); }}>
                    <option value="all">Все</option>
                    {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                </div>
              </CompactHeader>
              <CompactHeader label="Пользователь">
                <HeaderTextFilter value={filters.user} placeholder="имя/email" onChange={(value) => { setFilters((current) => ({ ...current, user: value })); setPage(1); }} />
              </CompactHeader>
              <CompactHeader label={`Размер${sizeMark}`} sortKey="size" activeSortKey={sort.startsWith("size") ? "size" : ""} direction={sort.endsWith("asc") ? "asc" : "desc"} onSort={() => setSort((c) => (c === "size-desc" ? "size-asc" : "size-desc"))}>
                <HeaderTextFilter value={filters.size} placeholder="КБ" onChange={(value) => { setFilters((current) => ({ ...current, size: value })); setPage(1); }} />
              </CompactHeader>
              <CompactHeader label={`Дата${dateMark}`} sortKey="date" activeSortKey={sort.startsWith("date") ? "date" : ""} direction={sort.endsWith("asc") ? "asc" : "desc"} onSort={() => setSort((c) => (c === "date-desc" ? "date-asc" : "date-desc"))}>
                <HeaderTextFilter value={filters.createdAt} placeholder="дд.мм.гггг" onChange={(value) => { setFilters((current) => ({ ...current, createdAt: value })); setPage(1); }} />
              </CompactHeader>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className={`${COMPACT_CELL_CLASS} py-10 text-center text-[var(--soft-ink-soft)]`}>Файлов нет</td>
              </tr>
            ) : (
              visible.map((f) => (
                <tr key={f.id}>
                  <td className={COMPACT_CELL_CLASS}>
                    <div className="flex items-center gap-2">
                      {f.mimeType.startsWith("image/") ? (
                        <a href={f.path} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.path} alt="" className="h-8 w-8 rounded border border-[var(--soft-paper-edge)] object-cover" />
                        </a>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--soft-surface)] text-lg">
                          {f.mimeType.includes("pdf") ? "📄" : f.mimeType.includes("audio") ? "🎵" : "📎"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="max-w-[180px] truncate text-xs font-medium text-[var(--soft-ink)]">{f.originalName}</p>
                        <p className="text-[10px] text-[var(--soft-ink-faint)]">{f.mimeType}</p>
                      </div>
                    </div>
                  </td>
                  <td className={COMPACT_CELL_CLASS}>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${kindClass(f.kind)}`}>{f.kind}</span>
                  </td>
                  <td className={COMPACT_CELL_CLASS}>
                    <p className="text-xs font-medium text-[var(--soft-ink)]">{f.userName}</p>
                    <p className="text-[10px] text-[var(--soft-ink-faint)]">{f.userEmail}</p>
                  </td>
                  <td className={`${COMPACT_CELL_CLASS} text-xs text-[var(--soft-ink-soft)]`}>{(f.sizeBytes / 1024).toFixed(0)} КБ</td>
                  <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap text-xs text-[var(--soft-ink-soft)]`}>{new Date(f.createdAt).toLocaleDateString("ru-RU")}</td>
                </tr>
              ))
            )}
          </tbody>
      </CompactTableShell>

      {pageCount > 1 && (
        <CompactPaginationBar page={safePage} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </div>
  );
}

function HeaderTextFilter({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <div className="p-1 pt-0">
      <input className={COMPACT_INPUT_CLASS} value={value} placeholder={placeholder} autoComplete="off" onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
