"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, Edit3, ExternalLink, RotateCcw, Search, Trash2, X } from "lucide-react";
import {
  adminMonthDays,
  adminMonthTitle,
  adminPeriodFromRuDate,
  adminPeriodToIsoDate,
  adminPeriodToRuDate,
  adminShiftMonth,
} from "@/app/admin/admin-period-utils";
import {
  CompactHeader,
  CompactPaginationBar,
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_INPUT_CLASS,
  COMPACT_SELECT_CLASS,
  type SortDirection,
} from "./compact-table";

export type AdminCompactFilterKind = "text" | "select" | "date" | "none";

export type AdminCompactColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  filterKind?: AdminCompactFilterKind;
  options?: Array<{ value: string; label: string }>;
  align?: "left" | "right" | "center";
};

export type AdminCompactAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: "open" | "download" | "edit" | "delete" | "cancel" | "check" | "refresh";
  variant?: "default" | "primary" | "danger";
  external?: boolean;
  disabled?: boolean;
};

export type AdminCompactBulkAction = {
  key: string;
  label: string;
  variant?: "subtle" | "danger" | "primary";
  disabled?: boolean;
};

export type AdminCompactCell =
  | string
  | number
  | null
  | {
      kind?: "text";
      value: string | number | null;
      subvalue?: string | null;
      title?: string;
      filterValue?: string;
      sortValue?: string | number;
    }
  | {
      kind: "status";
      label: string;
      tone?: "ok" | "warn" | "danger" | "neutral";
      filterValue?: string;
      sortValue?: string | number;
    }
  | {
      kind: "link";
      href: string;
      label?: string;
      title?: string;
      icon?: "open" | "download";
      external?: boolean;
      filterValue?: string;
      sortValue?: string | number;
    }
  | {
      kind: "details";
      label?: string;
      title: string;
      body: string;
      meta?: string;
      filterValue?: string;
      sortValue?: string | number;
    }
  | {
      kind: "actions";
      actions: AdminCompactAction[];
      filterValue?: string;
      sortValue?: string | number;
    }
  | {
      kind: "node";
      node: ReactNode;
      filterValue?: string;
      sortValue?: string | number;
    };

export type AdminCompactRow = {
  id: string;
  cells: Record<string, AdminCompactCell>;
};

export function AdminCompactDataTable({
  columns,
  rows,
  empty = "Нет данных",
  minWidth = "1120px",
  pageSize = 20,
  selectable = false,
  bulkActions = [],
  onBulkAction,
}: {
  columns: AdminCompactColumn[];
  rows: AdminCompactRow[];
  empty?: string;
  minWidth?: string;
  pageSize?: number;
  selectable?: boolean;
  bulkActions?: AdminCompactBulkAction[];
  onBulkAction?: (actionKey: string, selectedIds: string[]) => void;
}) {
  const [filters, setFilters] = useState<Record<string, string | string[]>>({});
  const [sortKey, setSortKey] = useState(columns.find((column) => column.sortable)?.key ?? columns[0]?.key ?? "");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const filteredRows = useMemo(() => {
    const filtered = rows.filter((row) =>
      columns.every((column) => {
        const filter = filters[column.key];
        if (!filter || (Array.isArray(filter) && filter.length === 0)) return true;
        const value = cellFilterValue(row.cells[column.key]);
        if (Array.isArray(filter)) return filter.some((item) => value.includes(item.toLowerCase()));
        return value.includes(filter.toLowerCase());
      }),
    );

    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const left = cellSortValue(a.cells[sortKey]);
      const right = cellSortValue(b.cells[sortKey]);
      const result = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "ru", { numeric: true });
      return sortDirection === "asc" ? result : -result;
    });
  }, [columns, filters, rows, sortDirection, sortKey]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(filteredRows.length / pageSize)));
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectableIds = visibleRows.map((row) => row.id);
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const hasBulkActions = selectable && selectedIds.size > 0;

  function updateFilter(key: string, value: string | string[]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function clearFilter(key: string) {
    setFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setPage(1);
  }

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function toggleVisibleRows(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of selectableIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-2" data-testid="admin-compact-data-table">
      {hasBulkActions ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="admin-compact-bulk-actions">
          <span className="font-medium text-[var(--soft-ink-soft)]">Выбрано: {selectedIds.size}</span>
          {bulkActions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="soft-admin-action"
              data-variant={action.variant ?? "subtle"}
              title={action.label}
              disabled={action.disabled || !onBulkAction}
              onClick={() => {
                if (!onBulkAction) return;
                onBulkAction(action.key, Array.from(selectedIds));
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="hidden md:block">
        <CompactTableShell minWidth={minWidth}>
          <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              {selectable ? (
                <th className="border-r border-[var(--soft-paper-edge)] p-0 align-top font-medium">
                  <div className="grid gap-1 p-1">
                    <div className="flex h-7 items-center justify-center">
                      <input
                        type="checkbox"
                        className="accent-[var(--soft-bordeaux)]"
                        checked={allVisibleSelected}
                        disabled={selectableIds.length === 0}
                        onChange={(event) => toggleVisibleRows(event.target.checked)}
                        aria-label="Выбрать строки на странице"
                      />
                    </div>
                  </div>
                </th>
              ) : null}
              {columns.map((column) => (
                <CompactHeader
                  key={column.key}
                  label={column.label}
                  sortKey={column.sortable ? column.key : undefined}
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={column.sortable ? toggleSort : undefined}
                >
                  <HeaderFilter
                    column={column}
                    value={filters[column.key]}
                    onChange={(value) => updateFilter(column.key, value)}
                    onClear={() => clearFilter(column.key)}
                  />
                </CompactHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className={`${COMPACT_CELL_CLASS} py-8 text-center text-sm text-[var(--soft-ink-soft)]`}>
                  {empty}
                </td>
              </tr>
            ) : visibleRows.map((row) => (
              <tr key={row.id} className="hover:bg-[var(--soft-surface)]">
                {selectable ? (
                  <td className={`${COMPACT_CELL_CLASS} text-center`}>
                    <input
                      type="checkbox"
                      className="accent-[var(--soft-bordeaux)]"
                      checked={selectedIds.has(row.id)}
                      onChange={(event) => {
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        });
                      }}
                      aria-label="Выбрать строку"
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`${COMPACT_CELL_CLASS} ${column.align === "right" ? "text-right tabular-nums" : column.align === "center" ? "text-center" : ""}`}
                  >
                    <CompactCell cell={row.cells[column.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </CompactTableShell>
      </div>

      <div className="grid gap-2 md:hidden" data-testid="admin-compact-mobile-cards">
        <details className="rounded-md border border-[var(--soft-paper-edge)] bg-white p-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.05em] text-[var(--soft-ink-soft)]">Фильтры и сортировка</summary>
          <div className="mt-2 grid gap-2">
            {columns.filter((column) => (column.filterKind ?? (column.options ? "select" : "text")) !== "none").map((column) => (
              <label key={column.key} className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">
                <span>{column.label}</span>
                <HeaderFilter
                  column={column}
                  value={filters[column.key]}
                  onChange={(value) => updateFilter(column.key, value)}
                  onClear={() => clearFilter(column.key)}
                />
              </label>
            ))}
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">
              <span>Сортировка</span>
              <select
                className={COMPACT_SELECT_CLASS}
                value={`${sortKey}:${sortDirection}`}
                onChange={(event) => {
                  const [nextKey, nextDirection] = event.target.value.split(":");
                  setSortKey(nextKey);
                  setSortDirection(nextDirection === "asc" ? "asc" : "desc");
                }}
              >
                {columns.filter((column) => column.sortable).flatMap((column) => [
                  <option key={`${column.key}:asc`} value={`${column.key}:asc`}>{column.label}: по возрастанию</option>,
                  <option key={`${column.key}:desc`} value={`${column.key}:desc`}>{column.label}: по убыванию</option>,
                ])}
              </select>
            </label>
          </div>
        </details>
        {visibleRows.length === 0 ? (
          <div className="rounded-md border border-[var(--soft-paper-edge)] bg-white px-3 py-8 text-center text-sm text-[var(--soft-ink-soft)]">{empty}</div>
        ) : visibleRows.map((row) => (
          <CompactMobileCard
            key={row.id}
            row={row}
            columns={columns}
            selectable={selectable}
            selected={selectedIds.has(row.id)}
            onToggle={(checked) => {
              setSelectedIds((current) => {
                const next = new Set(current);
                if (checked) next.add(row.id);
                else next.delete(row.id);
                return next;
              });
            }}
          />
        ))}
      </div>
      <CompactPaginationBar page={safePage} total={filteredRows.length} pageSize={pageSize} onPage={setPage} />
    </div>
  );
}

function CompactMobileCard({
  row,
  columns,
  selectable,
  selected,
  onToggle,
}: {
  row: AdminCompactRow;
  columns: AdminCompactColumn[];
  selectable: boolean;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const actionColumns = columns.filter((column) => column.filterKind === "none" || column.key === "actions" || column.key === "open");
  const valueColumns = columns.filter((column) => !actionColumns.includes(column));
  const titleColumn = valueColumns[0];
  return (
    <article className="admin-compact-mobile-card rounded-md border border-[var(--soft-paper-edge)] bg-white p-3 shadow-[var(--soft-shadow-sm)]" data-testid="admin-compact-mobile-card">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {titleColumn ? (
            <div className="text-sm font-semibold text-[var(--soft-ink)]">
              <CompactCell cell={row.cells[titleColumn.key]} />
            </div>
          ) : null}
        </div>
        {selectable ? (
          <input
            type="checkbox"
            className="mt-1 shrink-0 accent-[var(--soft-bordeaux)]"
            checked={selected}
            onChange={(event) => onToggle(event.target.checked)}
            aria-label="Выбрать строку"
          />
        ) : null}
      </div>
      <dl className="grid gap-2">
        {valueColumns.slice(titleColumn ? 1 : 0).map((column) => (
          <div key={column.key} className="grid gap-0.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--soft-ink-faint)]">{column.label}</dt>
            <dd className="min-w-0 text-xs text-[var(--soft-ink)]">
              <CompactCell cell={row.cells[column.key]} />
            </dd>
          </div>
        ))}
      </dl>
      {actionColumns.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t border-[var(--soft-paper-edge)] pt-2">
          {actionColumns.map((column) => <CompactCell key={column.key} cell={row.cells[column.key]} />)}
        </div>
      ) : null}
    </article>
  );
}

function HeaderFilter({
  column,
  value,
  onChange,
  onClear,
}: {
  column: AdminCompactColumn;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
  onClear: () => void;
}) {
  const filterKind = column.filterKind ?? (column.options ? "select" : "text");
  if (filterKind === "none") return null;
  if (filterKind === "select") {
    return (
      <MultiSelectHeaderFilter
        label={column.label}
        options={column.options ?? []}
        selected={Array.isArray(value) ? value : []}
        onChange={onChange}
        onClear={onClear}
      />
    );
  }
  if (filterKind === "date") {
    return (
      <DateHeaderFilter
        label={column.label}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        onClear={onClear}
      />
    );
  }

  const textValue = typeof value === "string" ? value : "";
  return (
    <div className="grid gap-1 p-1 pt-0">
      <div className="relative">
        <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-[var(--soft-ink-faint)]" aria-hidden="true" />
        <input
          type="text"
          className={`${COMPACT_INPUT_CLASS} pl-5 pr-6`}
          value={textValue}
          placeholder="поиск"
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Фильтр: ${column.label}`}
        />
        {textValue ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded text-[var(--soft-ink-faint)] hover:bg-[var(--soft-surface)] hover:text-[var(--soft-bordeaux)]"
            onClick={onClear}
            aria-label="Очистить фильтр"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function todayIso() {
  return adminPeriodToIsoDate(new Date());
}

function DateHeaderFilter({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [monthIso, setMonthIso] = useState(() => adminPeriodFromRuDate(value) ?? todayIso());
  // Owner 2026-07-17: the calendar was clipped by the table's overflow-auto
  // scroll container on short tables. Render it in a body portal at a fixed
  // position instead, so table height never limits it.
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selectedIso = adminPeriodFromRuDate(value);
  const days = useMemo(() => adminMonthDays(monthIso), [monthIso]);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    function closeOnScroll(event: Event) {
      if (dropdownRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [open]);

  function openCalendar() {
    setMonthIso(adminPeriodFromRuDate(value) ?? todayIso());
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setAnchorRect({ top: rect.bottom + 2, left: rect.left });
    setOpen((current) => !current);
  }

  function selectDay(iso: string) {
    onChange(adminPeriodToRuDate(iso));
    setMonthIso(iso);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative grid gap-1 p-1 pt-0">
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          className={`${COMPACT_INPUT_CLASS} pr-12`}
          value={value}
          placeholder="дд.мм.гггг"
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Фильтр: ${label}`}
        />
        {value ? (
          <button
            type="button"
            className="absolute right-6 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded text-[var(--soft-ink-faint)] hover:bg-[var(--soft-surface)] hover:text-[var(--soft-bordeaux)]"
            onClick={onClear}
            aria-label="Очистить фильтр"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="absolute right-1 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-[var(--soft-ink-faint)] hover:bg-[var(--soft-surface)] hover:text-[var(--soft-bordeaux)]"
          onClick={openCalendar}
          aria-label="Открыть календарь фильтра"
        >
          <CalendarDays className="size-3" aria-hidden="true" />
        </button>
      </div>
      {open && anchorRect ? createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[95] w-56 rounded-md border border-[var(--soft-paper-edge)] bg-white p-2 shadow-[var(--soft-shadow-sm)]"
          style={{
            top: Math.min(anchorRect.top, typeof window !== "undefined" ? window.innerHeight - 260 : anchorRect.top),
            left: Math.min(anchorRect.left, typeof window !== "undefined" ? window.innerWidth - 240 : anchorRect.left),
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="mb-1 flex items-center justify-between gap-1">
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded hover:bg-[var(--soft-surface)]"
              onClick={() => setMonthIso(adminShiftMonth(monthIso, -1))}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="size-3" aria-hidden="true" />
            </button>
            <span className="text-[10px] font-semibold capitalize text-[var(--soft-ink-soft)]">
              {adminMonthTitle(monthIso)}
            </span>
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded hover:bg-[var(--soft-surface)]"
              onClick={() => setMonthIso(adminShiftMonth(monthIso, 1))}
              aria-label="Следующий месяц"
            >
              <ChevronRight className="size-3" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-semibold uppercase text-[var(--soft-ink-faint)]">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const selected = day.iso === selectedIso;
              return (
                <button
                  key={day.iso}
                  type="button"
                  className={[
                    "h-6 rounded text-[10px] tabular-nums transition-colors",
                    day.current ? "text-[var(--soft-ink)]" : "text-[var(--soft-ink-faint)]",
                    day.disabled ? "cursor-not-allowed opacity-35" : selected ? "bg-[var(--soft-bordeaux)] font-semibold text-white hover:bg-[var(--soft-bordeaux)]" : "hover:bg-[var(--soft-surface)]",
                  ].filter(Boolean).join(" ")}
                  disabled={day.disabled}
                  onClick={() => selectDay(day.iso)}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function MultiSelectHeaderFilter({
  label,
  options,
  selected,
  onChange,
  onClear,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (value: string[]) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = new Set(selected);
  const summary = selected.length === 0
    ? "Все"
    : selected.length === 1
      ? options.find((option) => option.value.toLowerCase() === selected[0])?.label ?? "Выбрано: 1"
      : `Выбрано: ${selected.length}`;

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  }

  return (
    <div ref={rootRef} className="relative grid gap-1 p-1 pt-0">
      <button
        type="button"
        className={`${COMPACT_SELECT_CLASS} flex items-center justify-between gap-1 text-left`}
        onClick={() => setOpen((current) => !current)}
        aria-label={`Фильтр: ${label}`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-3 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute left-1 top-[calc(100%+1px)] z-[90] min-w-[10rem] rounded-md border border-[var(--soft-paper-edge)] bg-white p-1 shadow-[var(--soft-shadow-sm)]">
          {selected.length > 0 ? (
            <button
              type="button"
              className="mb-1 flex h-7 w-full items-center rounded px-2 text-left text-[11px] text-[var(--soft-ink-faint)] hover:bg-[var(--soft-surface)]"
              onClick={onClear}
            >
              Сбросить
            </button>
          ) : null}
          {options.map((option) => {
            const value = option.value.toLowerCase();
            return (
              <label
                key={option.value}
                className="flex h-7 w-full cursor-pointer items-center gap-2 rounded px-2 text-[11px] text-[var(--soft-ink)] hover:bg-[var(--soft-surface)]"
              >
                <input
                  type="checkbox"
                  className="accent-[var(--soft-bordeaux)]"
                  checked={selectedSet.has(value)}
                  onChange={() => toggle(value)}
                />
                <span className="truncate">{option.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CompactCell({ cell }: { cell: AdminCompactCell | undefined }) {
  if (cell === null || cell === undefined || cell === "") return <span className="text-[var(--soft-ink-faint)]">—</span>;
  if (typeof cell === "string" || typeof cell === "number") {
    return <span className="soft-admin-cell-truncate" title={String(cell)}>{cell}</span>;
  }
  if (cell.kind === "status") {
    return <span className="soft-admin-status-pill" data-tone={cell.tone ?? "neutral"}>{cell.label}</span>;
  }
  if (cell.kind === "link") {
    return (
      <a
        className="soft-admin-icon-button"
        href={cell.href}
        target={cell.external ? "_blank" : undefined}
        rel={cell.external ? "noopener noreferrer" : undefined}
        title={cell.title ?? cell.label ?? "Открыть"}
        aria-label={cell.title ?? cell.label ?? "Открыть"}
      >
        {cell.icon === "download" ? <Download className="size-3.5" aria-hidden="true" /> : <ExternalLink className="size-3.5" aria-hidden="true" />}
        {cell.label ? <span className="sr-only">{cell.label}</span> : null}
      </a>
    );
  }
  if (cell.kind === "details") {
    return <CompactDetailsCell cell={cell} />;
  }
  if (cell.kind === "actions") {
    return (
      <div className="soft-admin-table-actions">
        {cell.actions.map((action) => (
          action.onClick ? (
          <button
            key={`${action.label}-${action.href ?? action.icon ?? "button"}`}
            type="button"
            className="soft-admin-icon-button"
            data-variant={action.variant}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.label}
            aria-label={action.label}
          >
            {actionIcon(action.icon)}
          </button>
          ) : (
          <a
            key={`${action.label}-${action.href ?? action.icon ?? "link"}`}
            className="soft-admin-icon-button"
            data-variant={action.variant}
            href={action.href ?? "#"}
            target={action.external ? "_blank" : undefined}
            rel={action.external ? "noopener noreferrer" : undefined}
            title={action.label}
            aria-label={action.label}
          >
            {actionIcon(action.icon)}
          </a>
          )
        ))}
      </div>
    );
  }
  if (cell.kind === "node") return <>{cell.node}</>;
  return (
    <span title={cell.title ?? String(cell.value ?? "")}>
      <span className="soft-admin-cell-truncate font-medium text-[var(--soft-ink)]">{cell.value ?? "—"}</span>
      {cell.subvalue ? <span className="soft-admin-cell-muted">{cell.subvalue}</span> : null}
    </span>
  );
}

function CompactDetailsCell({
  cell,
}: {
  cell: Extract<AdminCompactCell, { kind: "details" }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="soft-admin-icon-button"
        onClick={() => setOpen(true)}
        title={cell.title}
        aria-label={cell.title}
      >
        <ExternalLink className="size-3.5" aria-hidden="true" />
        {cell.label ? <span className="sr-only">{cell.label}</span> : null}
      </button>
      {open ? (
        <dialog
          open
          className="soft-admin-detail-dialog"
          aria-modal="true"
          aria-label={cell.title}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="soft-admin-detail-dialog__panel">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--soft-paper-edge)] px-4 py-3">
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-semibold text-[var(--soft-bordeaux)]">{cell.title}</h3>
                {cell.meta ? <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{cell.meta}</p> : null}
              </div>
              <button
                type="button"
                className="soft-admin-icon-button shrink-0"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                title="Закрыть"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words px-4 py-3 text-xs leading-relaxed text-[var(--soft-ink)]">
              {cell.body || "Нет деталей"}
            </pre>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

function actionIcon(icon: AdminCompactAction["icon"]) {
  if (icon === "download") return <Download className="size-3.5" aria-hidden="true" />;
  if (icon === "edit") return <Edit3 className="size-3.5" aria-hidden="true" />;
  if (icon === "delete") return <Trash2 className="size-3.5" aria-hidden="true" />;
  if (icon === "cancel") return <Ban className="size-3.5" aria-hidden="true" />;
  if (icon === "check") return <CheckCircle2 className="size-3.5" aria-hidden="true" />;
  if (icon === "refresh") return <RotateCcw className="size-3.5" aria-hidden="true" />;
  return <ExternalLink className="size-3.5" aria-hidden="true" />;
}

function cellFilterValue(cell: AdminCompactCell | undefined) {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell).toLowerCase();
  if ("filterValue" in cell && cell.filterValue) return cell.filterValue.toLowerCase();
  if (cell.kind === "status") return cell.label.toLowerCase();
  if (cell.kind === "link") return [cell.label, cell.title, cell.href].filter(Boolean).join(" ").toLowerCase();
  if (cell.kind === "details") return [cell.title, cell.meta, cell.body, cell.filterValue].filter(Boolean).join(" ").toLowerCase();
  if (cell.kind === "actions") return cell.actions.map((action) => action.label).join(" ").toLowerCase();
  if (cell.kind === "node") return (cell.filterValue ?? "").toLowerCase();
  return [cell.value, cell.subvalue, cell.title].filter(Boolean).join(" ").toLowerCase();
}

function cellSortValue(cell: AdminCompactCell | undefined) {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string" || typeof cell === "number") return cell;
  if ("sortValue" in cell && cell.sortValue !== undefined) return cell.sortValue;
  if (cell.kind === "status") return cell.label;
  if (cell.kind === "link") return cell.label ?? cell.title ?? cell.href;
  if (cell.kind === "details") return cell.sortValue ?? cell.title;
  if (cell.kind === "actions") return cell.actions.map((action) => action.label).join(" ");
  if (cell.kind === "node") return cell.sortValue ?? cell.filterValue ?? "";
  return cell.value ?? "";
}
