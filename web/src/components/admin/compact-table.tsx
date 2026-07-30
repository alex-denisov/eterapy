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
  "h-7 w-full min-w-0 rounded border border-[var(--soft-paper-edge)] bg-white/85 px-1.5 text-[11px] text-[var(--soft-ink)] outline-none placeholder:text-[var(--soft-ink-faint)] focus:bg-white";
export const COMPACT_SELECT_CLASS =
  "h-7 w-full min-w-0 rounded border border-[var(--soft-paper-edge)] bg-white/85 px-1.5 text-[11px] text-[var(--soft-ink)] outline-none focus:bg-white";
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

type CompactPaginationItem = number | { type: "jump"; target: number; label: "..." };

function compactPaginationItems(page: number, totalPages: number): CompactPaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const items: CompactPaginationItem[] = [1];
  let start = Math.max(2, page - 1);
  let end = Math.min(totalPages - 1, page + 1);

  if (page <= 4) {
    start = 2;
    end = 5;
  } else if (page >= totalPages - 3) {
    start = totalPages - 4;
    end = totalPages - 1;
  }

  if (start > 2) items.push({ type: "jump", target: Math.max(1, page - 3), label: "..." });
  for (let item = start; item <= end; item += 1) items.push(item);
  if (end < totalPages - 1) items.push({ type: "jump", target: Math.min(totalPages, page + 3), label: "..." });
  items.push(totalPages);
  return items;
}

export function CompactTableShell({
  children,
  minWidth = "1180px",
}: {
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    // `min-w-0` парный к такому же в `AdminCompactDataTable`: обёртка таблицы
    // не имеет права расширять родителя под свою `min-width`, иначе прокрутка
    // уезжает за экран вместе с содержимым.
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-[var(--soft-paper-edge)] bg-white">
      <div className="min-w-0 max-w-full overflow-auto">
        <table className="soft-admin-compact-table w-full border-collapse text-left text-[11px] leading-tight" style={{ minWidth }}>
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-2 py-1.5 text-[11px] text-[var(--soft-ink-soft)]">
      <span>{start}-{end} из {total}</span>
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          {safePage > 1 ? (
            <button
              type="button"
              onClick={() => onPage(safePage - 1)}
              className="soft-admin-action h-7"
              data-variant="subtle"
              aria-label="Предыдущая страница"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Предыдущая
            </button>
          ) : null}
          {compactPaginationItems(safePage, totalPages).map((item, index) => {
            if (typeof item !== "number") {
              return (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  className="soft-admin-pagination-page"
                  onClick={() => onPage(item.target)}
                  title={`Перейти на ${item.target} страницу`}
                >
                  {item.label}
                </button>
              );
            }
            const active = item === safePage;
            return (
              <button
                key={item}
                type="button"
                className="soft-admin-pagination-page"
                data-active={active}
                onClick={() => onPage(item)}
                aria-current={active ? "page" : undefined}
              >
                {item}
              </button>
            );
          })}
          {safePage < totalPages ? (
            <button
              type="button"
              onClick={() => onPage(safePage + 1)}
              className="soft-admin-action h-7"
              data-variant="subtle"
              aria-label="Следующая страница"
            >
              Следующая
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
