"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Ban, CheckCircle2, ChevronDown, Download, Edit3, ExternalLink, RotateCcw, Search, Trash2, X } from "lucide-react";
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
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        {selectable && selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
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
        ) : <span />}
      </div>

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
      <CompactPaginationBar page={safePage} total={filteredRows.length} pageSize={pageSize} onPage={setPage} />
    </div>
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

  const textValue = typeof value === "string" ? value : "";
  return (
    <div className="grid gap-1 p-1 pt-0">
      <div className="relative">
        <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-[var(--soft-ink-faint)]" aria-hidden="true" />
        <input
          type="text"
          inputMode={filterKind === "date" ? "numeric" : undefined}
          className={`${COMPACT_INPUT_CLASS} pl-5 pr-6`}
          value={textValue}
          placeholder={filterKind === "date" ? "дд.мм.гггг" : "поиск"}
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
  if (cell.kind === "actions") return cell.actions.map((action) => action.label).join(" ");
  if (cell.kind === "node") return cell.sortValue ?? cell.filterValue ?? "";
  return cell.value ?? "";
}
