"use client";

import { useState, useTransition } from "react";
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
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SCHEDULED: "Утверждён",
  FAILED: "Ошибка",
};

export function DraftQueue({ rows }: { rows: DraftRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<DraftRow | null>(null);

  async function approve(id: string) {
    const response = await fetch(`/api/admin/marketing/publications/${id}/approve`, {
      method: "POST",
    });
    if (response.ok) {
      toast.success("Черновик утверждён. Наружу пока не уходит — адаптеры каналов в фазе 2.");
      startTransition(() => router.refresh());
    } else {
      toast.error("Не удалось утвердить черновик");
    }
  }

  const columns: AdminCompactColumn[] = [
    { key: "createdAt", label: "Создан", sortable: true, filterKind: "none" },
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
      createdAt: {
        value: new Intl.DateTimeFormat("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          timeZone: "Europe/Moscow",
        }).format(new Date(row.createdAt)),
        sortValue: row.createdAt,
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
        kind: "actions" as const,
        actions: [{ label: "Показать", onClick: () => setPreview(row) }],
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
    <>
      <AdminCompactDataTable
        columns={columns}
        rows={tableRows}
        pageSize={25}
        minWidth="1250px"
        empty="Очередь пуста — джоб пополнит её в ближайшие сутки"
      />

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Текст поста"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--soft-ink-faint)]">
                  {preview.platform} · {preview.cluster ?? "—"}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--soft-ink-strong)]">{preview.title}</h3>
              </div>
              <button type="button" className="soft-chip" onClick={() => setPreview(null)}>
                Закрыть
              </button>
            </div>
            {/* Текст поста — обычный текст, не HTML: в ленту уходит именно он. */}
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm text-[var(--soft-ink)]">
              {preview.body}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
