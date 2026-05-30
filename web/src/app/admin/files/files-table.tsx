"use client";

import { useMemo, useState } from "react";

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
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("date-desc");
  const [page, setPage] = useState(1);

  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.kind))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (q && !row.originalName.toLowerCase().includes(q) && !row.userName.toLowerCase().includes(q) && !row.userEmail.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "size-asc") return a.sizeBytes - b.sizeBytes;
      if (sort === "size-desc") return b.sizeBytes - a.sizeBytes;
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sort === "date-asc" ? ta - tb : tb - ta;
    });
  }, [rows, kind, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const dateMark = sort === "date-desc" ? " ▼" : sort === "date-asc" ? " ▲" : "";
  const sizeMark = sort === "size-desc" ? " ▼" : sort === "size-asc" ? " ▲" : "";

  return (
    <div data-testid="admin-files-table">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setKind("all"); setPage(1); }} data-active={kind === "all"} className="soft-admin-seg-btn">
          Все
        </button>
        {kinds.map((k) => (
          <button key={k} type="button" onClick={() => { setKind(k); setPage(1); }} data-active={kind === k} className="soft-admin-seg-btn">
            {k}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          placeholder="Поиск: файл или пользователь"
          aria-label="Поиск по файлам"
          className="soft-admin-table-filter mt-0 ml-auto h-8 w-60"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="soft-admin-data-table min-w-[820px]">
          <thead>
            <tr>
              <th>Файл</th>
              <th>Тип</th>
              <th>Пользователь</th>
              <th>
                <button type="button" className="cursor-pointer bg-transparent" onClick={() => setSort((c) => (c === "size-desc" ? "size-asc" : "size-desc"))}>
                  Размер{sizeMark}
                </button>
              </th>
              <th>
                <button type="button" className="cursor-pointer bg-transparent" onClick={() => setSort((c) => (c === "date-desc" ? "date-asc" : "date-desc"))}>
                  Дата{dateMark}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-[var(--soft-ink-soft)]">Файлов нет</td>
              </tr>
            ) : (
              visible.map((f) => (
                <tr key={f.id}>
                  <td>
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
                  <td>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${kindClass(f.kind)}`}>{f.kind}</span>
                  </td>
                  <td>
                    <p className="text-xs font-medium text-[var(--soft-ink)]">{f.userName}</p>
                    <p className="text-[10px] text-[var(--soft-ink-faint)]">{f.userEmail}</p>
                  </td>
                  <td className="text-xs text-[var(--soft-ink-soft)]">{(f.sizeBytes / 1024).toFixed(0)} КБ</td>
                  <td className="whitespace-nowrap text-xs text-[var(--soft-ink-soft)]">{new Date(f.createdAt).toLocaleDateString("ru-RU")}</td>
                </tr>
              ))
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
