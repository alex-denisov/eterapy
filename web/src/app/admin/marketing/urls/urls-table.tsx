"use client";

import { useMemo } from "react";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";

// B600 — таблица реестра URL. Та же механика, что у ядра и пользователей:
// фильтр в шапке, сортировка по колонке, страницы по 25 строк.
export type UrlRegistryTableRow = {
  path: string;
  weight: "P1" | "P2" | "P3";
  status: "live" | "redirect" | "gone" | "missing";
  statusLabel: string;
  sources: string;
  corePhrases: number;
  coreDemand: number;
  decision: string | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

const STATUS_TONE: Record<UrlRegistryTableRow["status"], "ok" | "neutral" | "warn" | "danger"> = {
  live: "ok",
  redirect: "neutral",
  gone: "warn",
  // «Пропал без решения» — единственное состояние, которое требует действия
  // прямо сейчас: адрес с весом отдаёт 404, и никто этого не решал.
  missing: "danger",
};

export function UrlRegistryTable({ rows }: { rows: UrlRegistryTableRow[] }) {
  const columns: AdminCompactColumn[] = useMemo(() => [
    { key: "path", label: "Адрес", sortable: true, filterKind: "text" },
    {
      key: "weight",
      label: "Вес",
      sortable: true,
      filterKind: "select",
      options: [
        { value: "P1", label: "P1" },
        { value: "P2", label: "P2" },
        { value: "P3", label: "P3" },
      ],
    },
    {
      key: "status",
      label: "Состояние",
      sortable: true,
      filterKind: "select",
      options: [
        { value: "Живой", label: "Живой" },
        { value: "Редирект", label: "Редирект" },
        { value: "Убран осознанно", label: "Убран осознанно" },
        { value: "Пропал без решения", label: "Пропал без решения" },
      ],
    },
    { key: "demand", label: "Спрос ядра / мес", sortable: true, filterKind: "none", align: "right" },
    { key: "phrases", label: "Фраз", sortable: true, filterKind: "none", align: "right" },
    { key: "sources", label: "Откуда вес", sortable: true, filterKind: "text" },
    { key: "decision", label: "Решение", sortable: false, filterKind: "text" },
  ], []);

  const tableRows: AdminCompactRow[] = useMemo(() => rows.map((row) => ({
    id: row.path,
    cells: {
      path: { value: row.path, sortValue: row.path },
      weight: {
        kind: "status" as const,
        label: row.weight,
        tone: row.weight === "P1" ? ("ok" as const) : ("neutral" as const),
        filterValue: row.weight,
        sortValue: row.weight,
      },
      status: {
        kind: "status" as const,
        label: row.statusLabel,
        tone: STATUS_TONE[row.status],
        filterValue: row.statusLabel,
        sortValue: row.statusLabel,
      },
      demand: { value: formatNumber(row.coreDemand), sortValue: row.coreDemand },
      phrases: { value: formatNumber(row.corePhrases), sortValue: row.corePhrases },
      sources: { value: row.sources, sortValue: row.sources },
      decision: { value: row.decision ?? "—", sortValue: row.decision ?? "" },
    },
  })), [rows]);

  return (
    <AdminCompactDataTable
      columns={columns}
      rows={tableRows}
      pageSize={25}
      minWidth="1100px"
      empty="Реестр пуст — проверьте сборку данных"
    />
  );
}
