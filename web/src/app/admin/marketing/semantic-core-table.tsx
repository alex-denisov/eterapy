"use client";

import { useMemo } from "react";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";

// B608: ядро выросло с 50 фраз до 1769, и простыня без фильтров стала
// нечитаемой. Таблица — та же, что у пользователей и платежей суперадминки:
// фильтр в шапке, сортировка по колонке, страницы по 25 строк.
export type SemanticCoreTableRow = {
  phrase: string;
  serviceName: string;
  cluster: string;
  landing: string;
  priority: "P1" | "P2";
  intent: string;
  monthlyDemand: number | null;
  demandSource: "live" | "baseline" | "unknown";
  /** B651: лучшая позиция по семье запросов, содержащих фразу. */
  position: number | null;
  /** Позиция по самой фразе слово в слово — обычно её нет и у растущих тем. */
  exactPosition: number | null;
  impressions: number;
  clicks: number;
  /** Сколько живых запросов Вебмастера попало в эту фразу. */
  matchedQueries: number;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function uniqueOptions(rows: SemanticCoreTableRow[], pick: (row: SemanticCoreTableRow) => string) {
  return [...new Set(rows.map(pick))]
    .sort((left, right) => left.localeCompare(right, "ru"))
    .map((value) => ({ value, label: value }));
}

export function SemanticCoreTable({ rows }: { rows: SemanticCoreTableRow[] }) {
  const columns: AdminCompactColumn[] = useMemo(() => [
    { key: "phrase", label: "Фраза", sortable: true, filterKind: "text" },
    { key: "service", label: "Услуга", sortable: true, filterKind: "select", options: uniqueOptions(rows, (row) => row.serviceName) },
    { key: "cluster", label: "Кластер", sortable: true, filterKind: "select", options: uniqueOptions(rows, (row) => row.cluster) },
    { key: "demand", label: "Спрос / мес", sortable: true, filterKind: "none", align: "right" },
    { key: "priority", label: "Приоритет", sortable: true, filterKind: "select", options: [{ value: "P1", label: "P1" }, { value: "P2", label: "P2" }] },
    { key: "intent", label: "Интент", sortable: true, filterKind: "select", options: uniqueOptions(rows, (row) => row.intent) },
    { key: "position", label: "Позиция", sortable: true, filterKind: "none", align: "right" },
    { key: "impressions", label: "Показы", sortable: true, filterKind: "none", align: "right" },
    { key: "landing", label: "Посадочная", sortable: true, filterKind: "text" },
  ], [rows]);

  const tableRows: AdminCompactRow[] = useMemo(() => rows.map((row, index) => ({
    id: `${row.phrase}-${index}`,
    cells: {
      phrase: { value: row.phrase, sortValue: row.phrase },
      service: { value: row.serviceName, filterValue: row.serviceName, sortValue: row.serviceName },
      cluster: { value: row.cluster, filterValue: row.cluster, sortValue: row.cluster },
      demand: {
        value: row.monthlyDemand === null ? "—" : formatNumber(row.monthlyDemand),
        subvalue: row.demandSource === "live" ? "живой замер" : null,
        sortValue: row.monthlyDemand ?? 0,
      },
      priority: {
        kind: "status" as const,
        label: row.priority,
        tone: row.priority === "P1" ? ("ok" as const) : ("neutral" as const),
        filterValue: row.priority,
        sortValue: row.priority,
      },
      intent: { value: row.intent, filterValue: row.intent, sortValue: row.intent },
      position: {
        value: row.position === null ? "—" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(row.position),
        // B651: прочерк здесь теперь значит «показов по этой теме нет вовсе».
        // Раньше он значил «мы сравнивали строки на равенство» — и стоял даже
        // там, где показы были.
        subvalue: row.matchedQueries === 0
          ? "нет показов"
          : row.exactPosition !== null
            ? `${row.matchedQueries} запр. · точно по фразе ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(row.exactPosition)}`
            : `${row.matchedQueries} запр. · точной фразы нет`,
        // Без позиции строка должна падать в конец сортировки «сверху лучшие»,
        // а не изображать первое место.
        sortValue: row.position ?? 1000,
      },
      impressions: { value: formatNumber(row.impressions), sortValue: row.impressions },
      landing: {
        kind: "link" as const,
        href: `https://eterapy.com${row.landing}`,
        label: row.landing,
        external: true,
        icon: "open" as const,
        filterValue: row.landing,
        sortValue: row.landing,
      },
    },
  })), [rows]);

  return (
    <AdminCompactDataTable
      columns={columns}
      rows={tableRows}
      pageSize={25}
      minWidth="1180px"
      empty="Ядро пустое — проверьте сборку данных"
    />
  );
}
