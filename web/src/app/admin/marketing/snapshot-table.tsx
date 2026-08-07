"use client";

/**
 * B626 — таблица суточных срезов поисковой аналитики.
 *
 * Показывает не только значение, но и разницу с предыдущими сутками. Именно
 * разница отвечает на вопрос владельца «обновляется ли это вообще»: значение
 * может законно не меняться, а вот отсутствие строки за вчера — уже дефект.
 */

import { useMemo } from "react";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";

export interface MarketingSnapshotTableRow {
  dayKey: string;
  capturedAt: string;
  impressions: number;
  clicks: number;
  averagePosition: number | null;
  searchablePages: number | null;
  organicVisits: number;
  observedQueries: number | null;
}

const numberFormat = new Intl.NumberFormat("ru-RU");
const positionFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function delta(current: number | null, previous: number | null | undefined) {
  if (current === null || previous === null || previous === undefined) return undefined;
  const diff = current - previous;
  if (diff === 0) return "без изменений";
  return `${diff > 0 ? "+" : "−"}${numberFormat.format(Math.abs(diff))} за сутки`;
}

/**
 * B697: уровень известен только за сутки, когда срез действительно снимался.
 * За остальные сутки в строке есть поток, но состояния индексации нет, и
 * показывать там `0` значило бы утверждать «в поиске не было ни одной страницы».
 */
function level(value: number | null) {
  return value === null ? "нет замера" : numberFormat.format(value);
}

export function MarketingSnapshotTable({ rows }: { rows: MarketingSnapshotTableRow[] }) {
  const columns: AdminCompactColumn[] = useMemo(() => [
    { key: "day", label: "Дата среза", sortable: true, filterKind: "date" },
    { key: "impressions", label: "Показы", sortable: true, filterKind: "none", align: "right" },
    { key: "clicks", label: "Клики", sortable: true, filterKind: "none", align: "right" },
    { key: "position", label: "Средняя позиция", sortable: true, filterKind: "none", align: "right" },
    { key: "pages", label: "Страниц в поиске", sortable: true, filterKind: "none", align: "right" },
    { key: "queries", label: "Наблюдаемых запросов", sortable: true, filterKind: "none", align: "right" },
    { key: "visits", label: "Визиты из поисковиков", sortable: true, filterKind: "none", align: "right" },
  ], []);

  const tableRows: AdminCompactRow[] = useMemo(() => rows.map((row, index) => {
    // Строки приходят от свежей к старой, поэтому «предыдущие сутки» — это
    // следующий элемент массива, а не предыдущий.
    const older = rows[index + 1];
    return {
      id: row.dayKey,
      cells: {
        day: {
          value: new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(`${row.dayKey}T12:00:00+03:00`)),
          subvalue: `снят ${new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", timeStyle: "short" }).format(new Date(row.capturedAt))}`,
          sortValue: row.dayKey,
        },
        impressions: {
          value: numberFormat.format(row.impressions),
          subvalue: delta(row.impressions, older?.impressions),
          sortValue: row.impressions,
        },
        clicks: {
          value: numberFormat.format(row.clicks),
          subvalue: delta(row.clicks, older?.clicks),
          sortValue: row.clicks,
        },
        position: {
          value: row.averagePosition === null ? "нет замера" : positionFormat.format(row.averagePosition),
          sortValue: row.averagePosition ?? Number.MAX_SAFE_INTEGER,
        },
        pages: {
          value: level(row.searchablePages),
          subvalue: delta(row.searchablePages, older?.searchablePages),
          sortValue: row.searchablePages ?? -1,
        },
        queries: {
          value: level(row.observedQueries),
          subvalue: delta(row.observedQueries, older?.observedQueries),
          sortValue: row.observedQueries ?? -1,
        },
        visits: {
          value: numberFormat.format(row.organicVisits),
          subvalue: delta(row.organicVisits, older?.organicVisits),
          sortValue: row.organicVisits,
        },
      },
    };
  }), [rows]);

  return (
    <AdminCompactDataTable
      columns={columns}
      rows={tableRows}
      pageSize={14}
      minWidth="980px"
      empty="Срезов пока нет"
    />
  );
}
