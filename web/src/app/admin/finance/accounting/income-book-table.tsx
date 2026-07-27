"use client";

import { useMemo } from "react";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";

// B591 фаза 3 (владелец 2026-07-27: «сделать таблицу в стиле/классе таблиц
// … на примере таблиц с пользователями в суперадминке»). Книга доходов — тот
// документ, который отправляют бухгалтеру, и искать в ней строку глазами по
// простыне нельзя: нужен фильтр по виду продажи, по признанию и поиск по
// номеру платежа.
export type IncomeBookTableRow = {
  id: string;
  date: string;
  sortDate: number;
  provider: string;
  reference: string;
  subject: string;
  note: string | null;
  issue: string | null;
  turnoverRub: number;
  ownIncomeRub: number | null;
  recognition: string;
};

const rub = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

function options(rows: IncomeBookTableRow[], pick: (row: IncomeBookTableRow) => string) {
  return [...new Set(rows.map(pick))]
    .sort((left, right) => left.localeCompare(right, "ru"))
    .map((value) => ({ value, label: value }));
}

export function IncomeBookTable({ rows }: { rows: IncomeBookTableRow[] }) {
  const columns: AdminCompactColumn[] = useMemo(() => [
    { key: "date", label: "Дата", sortable: true, filterKind: "text" },
    { key: "provider", label: "Источник", sortable: true, filterKind: "select", options: options(rows, (row) => row.provider) },
    { key: "reference", label: "Номер платежа", sortable: true, filterKind: "text" },
    { key: "subject", label: "Что продано", sortable: true, filterKind: "select", options: options(rows, (row) => row.subject) },
    { key: "turnover", label: "Оборот", sortable: true, filterKind: "none", align: "right" },
    { key: "income", label: "Ваш доход", sortable: true, filterKind: "none", align: "right" },
    { key: "recognition", label: "Признание", sortable: true, filterKind: "select", options: options(rows, (row) => row.recognition) },
  ], [rows]);

  const tableRows: AdminCompactRow[] = useMemo(() => rows.map((row) => ({
    id: row.id,
    cells: {
      date: { value: row.date, sortValue: row.sortDate },
      provider: { value: row.provider, filterValue: row.provider, sortValue: row.provider },
      reference: { value: row.reference, sortValue: row.reference },
      subject: {
        value: row.subject,
        // Проблема строки видна прямо в ячейке: в налоговом документе она
        // важнее самой продажи, потому что блокирует выгрузку.
        subvalue: row.issue ?? row.note,
        filterValue: `${row.subject} ${row.issue ?? ""} ${row.note ?? ""}`,
        sortValue: row.subject,
      },
      turnover: { value: rub(row.turnoverRub), sortValue: row.turnoverRub },
      income: { value: row.ownIncomeRub === null ? "—" : rub(row.ownIncomeRub), sortValue: row.ownIncomeRub ?? -1 },
      recognition: {
        kind: "status" as const,
        label: row.recognition,
        tone: row.issue ? ("danger" as const) : row.recognition === "возврат" ? ("warn" as const) : ("ok" as const),
        filterValue: row.recognition,
        sortValue: row.recognition,
      },
    },
  })), [rows]);

  return (
    <AdminCompactDataTable
      columns={columns}
      rows={tableRows}
      pageSize={25}
      minWidth="980px"
      empty="За выбранный год денежных поступлений нет"
    />
  );
}
