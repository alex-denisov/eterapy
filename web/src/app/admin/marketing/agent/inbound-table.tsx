"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminCompactDataTable, type AdminCompactColumn, type AdminCompactRow } from "@/components/admin/compact-client-table";

/**
 * B662 — очередь входящего с ручным закрытием.
 *
 * Таблица клиентская не ради интерактива, а потому что кнопка «я ответил сам»
 * обязана существовать: без неё закрытый живым человеком разговор висел в
 * очереди вечно и через сутки поднимал сторож просроченного.
 */
export interface InboundTableRow {
  id: string;
  time: string;
  timeSort: number;
  platform: string;
  kind: string;
  author: string;
  statusLabel: string;
  statusTone: "ok" | "warn" | "danger";
  statusFilter: string;
  resolved: boolean;
  detailsTitle: string;
  detailsBody: string;
}

export function MarketingInboundTable({ rows }: { rows: InboundTableRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function close(id: string, status: "ANSWERED" | "IGNORED") {
    setBusy(id);
    try {
      const response = await fetch("/api/admin/marketing/inbound", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Не удалось закрыть входящее");
      toast.success(status === "ANSWERED" ? "Отмечено: ответили вручную" : "Отмечено: ответ не нужен");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось закрыть входящее");
    } finally {
      setBusy(null);
    }
  }

  const columns: AdminCompactColumn[] = [
    { key: "time", label: "Пришло", sortable: true, filterKind: "date" },
    { key: "platform", label: "Площадка", sortable: true, filterKind: "select" },
    { key: "kind", label: "Тип", sortable: true, filterKind: "select" },
    { key: "author", label: "Автор", sortable: true, filterKind: "text" },
    { key: "status", label: "Состояние", sortable: true, filterKind: "select" },
    { key: "text", label: "Сообщение", filterKind: "none" },
    { key: "actions", label: "Действие", filterKind: "none" },
  ];

  const tableRows: AdminCompactRow[] = rows.map((row) => ({
    id: row.id,
    cells: {
      time: { value: row.time, sortValue: row.timeSort },
      platform: row.platform,
      kind: row.kind,
      author: row.author,
      status: {
        kind: "status" as const,
        label: row.statusLabel,
        tone: row.statusTone,
        filterValue: row.statusFilter,
      },
      text: {
        kind: "details" as const,
        label: "Показать",
        title: row.detailsTitle,
        body: row.detailsBody,
        meta: row.statusFilter,
      },
      actions: row.resolved
        ? "—"
        : {
          kind: "actions" as const,
          // B670: иконки РАЗНЫЕ. Без явной иконки обе кнопки получали общий
          // запасной значок — владелец 2026-08-05 закрыл строку наугад, потому
          // что «ответил вручную» и «ответ не нужен» выглядели одинаково.
          actions: [
            {
              label: busy === row.id ? "…" : "Ответил вручную",
              icon: "check" as const,
              onClick: () => void close(row.id, "ANSWERED"),
            },
            {
              label: "Ответ не нужен",
              icon: "dismiss" as const,
              onClick: () => void close(row.id, "IGNORED"),
            },
          ],
        },
    },
  }));

  return (
    <AdminCompactDataTable
      columns={columns}
      rows={tableRows}
      pageSize={25}
      minWidth="1250px"
      empty="Входящих, ждущих ответа, нет"
    />
  );
}
