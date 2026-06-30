/**
 * Shared "compact admin table" primitives — the same dense, filter-in-header,
 * client-paginated style used by the "Промты продуктов" table on /admin/ai.
 *
 * Extracted so /admin/users and /admin/logs can reuse the identical look
 * instead of each hand-rolling a bulky `soft-admin-data-table`. The AI
 * control center keeps its own local copies (pre-existing), so this module is
 * additive and does not touch that file.
 */

import { type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";

export const COMPACT_TABLE_PAGE_SIZE = 25;

export const COMPACT_INPUT_CLASS =
  "h-7 w-full min-w-0 rounded border border-[var(--soft-paper-edge)] bg-white/85 px-1.5 text-[11px] text-[var(--soft-ink)] outline-none placeholder:text-[var(--soft-ink-faint)] focus:bg-white focus:ring-1 focus:ring-[var(--soft-bordeaux)]";
export const COMPACT_SELECT_CLASS =
  "h-7 w-full min-w-0 rounded border border-[var(--soft-paper-edge)] bg-white/85 px-1.5 text-[11px] text-[var(--soft-ink)] outline-none focus:bg-white focus:ring-1 focus:ring-[var(--soft-bordeaux)]";
export const COMPACT_HEADER_CLASS =
  "border-r border-[var(--soft-paper-edge)] p-0 align-top font-medium";
export const COMPACT_CELL_CLASS =
  "border-r border-[var(--soft-paper-edge)] px-1.5 py-1 align-top";

export type SortDirection = "asc" | "desc";

export function compactClampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

export function compactPageCount(total: number, pageSize = COMPACT_TABLE_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function CompactTableShell({
  children,
  minWidth = "1180px",
}: {
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="max-w-full overflow-hidden rounded-md border border-[var(--soft-paper-edge)] bg-white">
      <div className="max-w-full overflow-auto">
        <table className="w-full border-collapse text-left text-[11px] leading-tight" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function CompactHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  children,
}: {
  label: string;
  sortKey?: string;
  activeSortKey?: string;
  direction?: SortDirection;
  onSort?: (key: string) => void;
  children?: ReactNode;
}) {
  const active = sortKey && activeSortKey === sortKey;
  const content = (
    <>
      <span>{label}</span>
      {sortKey && active && direction === "asc" ? <ArrowUp className="h-3 w-3 text-[var(--soft-bordeaux)]" aria-hidden="true" /> : null}
      {sortKey && active && direction === "desc" ? <ArrowDown className="h-3 w-3 text-[var(--soft-bordeaux)]" aria-hidden="true" /> : null}
      {sortKey && !active ? <ChevronsUpDown className="h-3 w-3 text-[var(--soft-ink-soft)]" aria-hidden="true" /> : null}
      {active && <span className="sr-only">sorted {direction}</span>}
    </>
  );

  if (!sortKey || !onSort) {
    return (
      <th className={COMPACT_HEADER_CLASS} scope="col">
        <div className="flex h-7 w-full items-center justify-between gap-1 px-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">
          {content}
        </div>
        {children}
      </th>
    );
  }

  return (
    <th className={COMPACT_HEADER_CLASS} scope="col">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex h-7 w-full items-center justify-between gap-1 px-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]"
      >
        {content}
      </button>
      {children}
    </th>
  );
}

export function CompactPaginationBar({
  page,
  total,
  onPage,
  pageSize = COMPACT_TABLE_PAGE_SIZE,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
  pageSize?: number;
}) {
  const totalPages = compactPageCount(total, pageSize);
  const safePage = compactClampPage(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-2 py-1 text-[11px] text-[var(--soft-ink-soft)]">
      <span>{start}-{end} из {total}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPage(safePage - 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--soft-paper-edge)] bg-white disabled:opacity-40"
          aria-label="Предыдущая страница"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span className="min-w-14 text-center">{safePage}/{totalPages}</span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPage(safePage + 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--soft-paper-edge)] bg-white disabled:opacity-40"
          aria-label="Следующая страница"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
