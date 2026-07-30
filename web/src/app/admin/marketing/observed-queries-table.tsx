"use client";

/**
 * B626 — «Запросы, по которым ETerapy уже показывается» в стиле реестра
 * пользователей.
 *
 * Прежняя таблица была рукописной: без пагинации, без сортировки, а поиск
 * работал через форму с перезагрузкой страницы и параметром `?q=`. На сотне
 * запросов это уже неудобно, а на тысяче — неработоспособно. Здесь та же
 * компактная таблица суперадминки, что и во всех остальных реестрах, поэтому
 * фильтры, сортировка и постраничная навигация ведут себя одинаково везде.
 */

import { useMemo } from "react";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";

export interface ObservedQueryRow {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  averagePosition: number | null;
  opportunity: string;
}

const numberFormat = new Intl.NumberFormat("ru-RU");
const percentFormat = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });
const positionFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function opportunityTone(value: string) {
  if (value === "Быстрый рост") return "ok" as const;
  if (value === "Сниппет") return "neutral" as const;
  if (value === "Усилить страницу") return "warn" as const;
  return "neutral" as const;
}

export function ObservedQueriesTable({ rows }: { rows: ObservedQueryRow[] }) {
  const opportunities = useMemo(() => {
    const unique = [...new Set(rows.map((row) => row.opportunity))].sort();
    return unique.map((value) => ({ value, label: value }));
  }, [rows]);

  const columns: AdminCompactColumn[] = useMemo(() => [
    { key: "query", label: "Запрос", sortable: true, filterKind: "text" },
    { key: "impressions", label: "Показы", sortable: true, filterKind: "none", align: "right" },
    { key: "clicks", label: "Клики", sortable: true, filterKind: "none", align: "right" },
    { key: "ctr", label: "CTR", sortable: true, filterKind: "none", align: "right" },
    { key: "position", label: "Позиция", sortable: true, filterKind: "none", align: "right" },
    { key: "opportunity", label: "Следующий ход", sortable: true, filterKind: "select", options: opportunities },
  ], [opportunities]);

  const tableRows: AdminCompactRow[] = useMemo(() => rows.map((row) => ({
    id: row.query,
    cells: {
      query: { value: row.query, sortValue: row.query, filterValue: row.query },
      impressions: { value: numberFormat.format(row.impressions), sortValue: row.impressions },
      clicks: { value: numberFormat.format(row.clicks), sortValue: row.clicks },
      ctr: { value: percentFormat.format(row.ctr), sortValue: row.ctr },
      position: {
        value: row.averagePosition === null ? "—" : positionFormat.format(row.averagePosition),
        // Запрос без замера позиции не должен всплывать наверх при сортировке
        // «лучшие сверху»: отсутствие данных — это не первое место.
        sortValue: row.averagePosition ?? Number.MAX_SAFE_INTEGER,
      },
      opportunity: {
        kind: "status" as const,
        label: row.opportunity,
        tone: opportunityTone(row.opportunity),
        filterValue: row.opportunity,
      },
    },
  })), [rows]);

  return (
    <AdminCompactDataTable
      columns={columns}
      rows={tableRows}
      pageSize={25}
      minWidth="900px"
      empty="Вебмастер пока не вернул наблюдаемые запросы"
    />
  );
}
