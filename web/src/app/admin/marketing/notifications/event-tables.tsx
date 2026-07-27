"use client";

import { useMemo } from "react";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";

/**
 * B599 (батч №20) · Две таблицы каталога.
 *
 * Раньше матрица была руками свёрстанной `<table>` с `text-neutral-*` и
 * `dark:` — то есть единственная таблица в админке, не похожая ни на одну
 * другую, и рядом с журналом на общем компоненте это читалось как сбой вёрстки.
 * Владелец: «почини вёрстку и сделай таблицу по стилю/классу такую же, как
 * таблица с пользователями». Обе таблицы переведены на
 * `AdminCompactDataTable` — тот же компонент, что и у /admin/users, вместе с
 * его фильтрами в шапке, сортировкой и постраничностью.
 */

export type MatrixRow = {
  key: string;
  category: string;
  audience: string;
  fire: string;
  trigger: string;
  channels: string;
  cooldown: string;
  subject: string;
  body: string;
  rationale: string;
};

export type SystemRow = {
  key: string;
  label: string;
  kind: string;
  category: string;
  audience: string;
  trigger: string;
  channels: string;
  optional: string;
};

export function MarketingMatrixTable({
  rows,
  categories,
}: {
  rows: MatrixRow[];
  categories: Array<{ value: string; label: string }>;
}) {
  const columns: AdminCompactColumn[] = useMemo(
    () => [
      { key: "key", label: "Событие", sortable: true, filterKind: "text" },
      { key: "category", label: "Категория", sortable: true, filterKind: "select", options: categories },
      { key: "audience", label: "Кому", sortable: true, filterKind: "text" },
      { key: "fire", label: "Запуск", sortable: true, filterKind: "text" },
      { key: "trigger", label: "Когда уходит", sortable: false, filterKind: "text" },
      { key: "channels", label: "Канал", sortable: true, filterKind: "text" },
      { key: "cooldown", label: "Не чаще", sortable: true, filterKind: "none", align: "right" },
      { key: "text", label: "Текст", sortable: false, filterKind: "text" },
      { key: "rationale", label: "Почему уместно", sortable: false, filterKind: "text" },
    ],
    [categories],
  );

  const tableRows: AdminCompactRow[] = useMemo(
    () =>
      rows.map((row) => ({
        id: row.key,
        cells: {
          key: { value: row.key, sortValue: row.key },
          category: { value: row.category, sortValue: row.category },
          audience: { value: row.audience, sortValue: row.audience },
          fire: { value: row.fire, sortValue: row.fire },
          trigger: { value: row.trigger, title: row.trigger },
          channels: { value: row.channels, sortValue: row.channels },
          cooldown: { value: row.cooldown, sortValue: row.cooldown },
          text: {
            kind: "details" as const,
            label: "Показать",
            title: row.subject,
            body: row.body,
            meta: `${row.key} · ${row.channels}`,
            filterValue: `${row.subject} ${row.body}`,
          },
          rationale: { value: row.rationale, title: row.rationale, filterValue: row.rationale },
        },
      })),
    [rows],
  );

  return (
    <AdminCompactDataTable
      columns={columns}
      rows={tableRows}
      pageSize={25}
      minWidth="1500px"
      empty="Матрица пуста"
    />
  );
}

export function SystemCatalogTable({
  rows,
  categories,
}: {
  rows: SystemRow[];
  categories: Array<{ value: string; label: string }>;
}) {
  const columns: AdminCompactColumn[] = useMemo(
    () => [
      { key: "key", label: "Событие", sortable: true, filterKind: "text" },
      { key: "label", label: "Название", sortable: true, filterKind: "text" },
      { key: "kind", label: "Откуда", sortable: true, filterKind: "text" },
      { key: "category", label: "Раздел", sortable: true, filterKind: "select", options: categories },
      { key: "audience", label: "Кому", sortable: true, filterKind: "text" },
      { key: "trigger", label: "Когда уходит", sortable: false, filterKind: "text" },
      { key: "channels", label: "Каналы", sortable: true, filterKind: "text" },
      { key: "optional", label: "Отключаемо", sortable: true, filterKind: "text" },
    ],
    [categories],
  );

  const tableRows: AdminCompactRow[] = useMemo(
    () =>
      rows.map((row) => ({
        id: row.key,
        cells: {
          key: { value: row.key, sortValue: row.key },
          label: { value: row.label, sortValue: row.label },
          kind: { value: row.kind, sortValue: row.kind },
          category: { value: row.category, sortValue: row.category },
          audience: { value: row.audience, sortValue: row.audience },
          trigger: { value: row.trigger, title: row.trigger },
          channels: { value: row.channels, sortValue: row.channels },
          optional: {
            kind: "status" as const,
            label: row.optional,
            // «Нельзя отключить» — не ошибка и не тревога: это про письмо
            // сброса пароля. Нейтральный тон, а не warn.
            tone: row.optional === "Нельзя отключить" ? ("neutral" as const) : ("ok" as const),
            filterValue: row.optional,
            sortValue: row.optional,
          },
        },
      })),
    [rows],
  );

  return (
    <AdminCompactDataTable
      columns={columns}
      rows={tableRows}
      pageSize={25}
      minWidth="1400px"
      empty="Каталог пуст"
    />
  );
}
