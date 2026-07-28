"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";

/**
 * B589 фаза 1 · Очередь черновиков.
 *
 * ⚠ ЗДЕСЬ НЕТ КНОПКИ «ОПУБЛИКОВАТЬ», и это фаза, а не недоделка. Наружу в фазе
 * 1 не уходит ничего: адаптеров каналов ещё нет. Кнопка «Утвердить» переводит
 * черновик в `SCHEDULED` — то есть в состояние «человек это прочитал и не
 * возражает». Выпускать утверждённое будет `cron.marketing-publish` (фаза 2)
 * и только при включённом `MARKETING_AUTOPUBLISH`.
 */

export type DraftRow = {
  id: string;
  status: string;
  platform: string;
  cluster: string | null;
  targetQuery: string | null;
  title: string;
  body: string;
  destinationUrl: string | null;
  scheduledFor: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SCHEDULED: "Утверждён",
  PUBLISHING: "Публикуется",
  FAILED: "Ошибка",
};

export function DraftQueue({ rows }: { rows: DraftRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function approve(id: string) {
    const response = await fetch(`/api/admin/marketing/publications/${id}/approve`, {
      method: "POST",
    });
    if (response.ok) {
      toast.success("Черновик утверждён. Он выйдет по расписанию, если автопубликация включена и канал настроен.");
      startTransition(() => router.refresh());
    } else {
      toast.error("Не удалось утвердить черновик");
    }
  }

  const columns: AdminCompactColumn[] = [
    { key: "scheduledFor", label: "Плановая дата", sortable: true, filterKind: "date" },
    { key: "platform", label: "Канал", sortable: true, filterKind: "text" },
    { key: "cluster", label: "Кластер", sortable: true, filterKind: "text" },
    { key: "targetQuery", label: "Запрос", sortable: true, filterKind: "text" },
    { key: "title", label: "Заголовок", sortable: true, filterKind: "text" },
    { key: "status", label: "Состояние", sortable: true, filterKind: "text" },
    { key: "text", label: "Текст", sortable: false, filterKind: "none" },
    { key: "actions", label: "Действия", sortable: false, filterKind: "none" },
  ];

  const tableRows: AdminCompactRow[] = rows.map((row) => ({
    id: row.id,
    cells: {
      scheduledFor: {
        value: new Intl.DateTimeFormat("ru-RU", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Europe/Moscow",
        }).format(new Date(row.scheduledFor ?? row.createdAt)),
        sortValue: row.scheduledFor ?? row.createdAt,
      },
      platform: { value: row.platform, sortValue: row.platform },
      cluster: { value: row.cluster ?? "—", sortValue: row.cluster ?? "" },
      targetQuery: { value: row.targetQuery ?? "—", sortValue: row.targetQuery ?? "" },
      title: { value: row.title, title: row.title, sortValue: row.title },
      status: {
        kind: "status" as const,
        label: STATUS_LABELS[row.status] ?? row.status,
        tone: row.status === "FAILED" ? ("danger" as const) : row.status === "SCHEDULED" ? ("ok" as const) : ("neutral" as const),
        filterValue: STATUS_LABELS[row.status] ?? row.status,
        sortValue: row.status,
      },
      text: {
        kind: "details" as const,
        label: "Показать",
        title: row.title,
        body: row.body || "Текст ещё не сгенерирован.",
        meta: `${row.platform} · ${new Intl.DateTimeFormat("ru-RU", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Europe/Moscow",
        }).format(new Date(row.scheduledFor ?? row.createdAt))}`,
        filterValue: `${row.title} ${row.body}`,
      },
      actions: {
        kind: "actions" as const,
        actions: [
          {
            label: "Утвердить",
            variant: "primary" as const,
            disabled: pending || row.status !== "DRAFT",
            onClick: () => void approve(row.id),
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
      empty="Очередь пуста — джоб пополнит её в ближайшие сутки"
    />
  );
}
