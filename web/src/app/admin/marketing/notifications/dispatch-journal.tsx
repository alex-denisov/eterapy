"use client";

import { useMemo, useState } from "react";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";

export type DispatchRow = {
  id: string;
  recipient: string;
  eventKey: string;
  category: string;
  channel: string;
  status: string;
  blockedBy: string | null;
  subject: string | null;
  body: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Отправлено",
  blocked: "Не отправлено",
  failed: "Ошибка",
};

const STATUS_TONE: Record<string, "ok" | "neutral" | "warn" | "danger"> = {
  sent: "ok",
  blocked: "neutral",
  failed: "danger",
};

function formatMoscow(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(iso));
}

/**
 * B599 · Журнал + просмотр того, что ушло.
 *
 * ⚠ Тело письма показывается в ИЗОЛИРОВАННОМ фрейме с пустым `sandbox`.
 * Это чужой HTML в админском origin: вставить его в общий документ значило бы
 * дать письму доступ к сессии суперадмина. Пустой `sandbox` отключает скрипты,
 * формы и переходы — остаётся ровно вид.
 */
export function DispatchJournal({ rows }: { rows: DispatchRow[] }) {
  const [preview, setPreview] = useState<DispatchRow | null>(null);

  const columns: AdminCompactColumn[] = useMemo(
    () => [
      { key: "createdAt", label: "Когда", sortable: true, filterKind: "none" },
      { key: "recipient", label: "Кому", sortable: true, filterKind: "text" },
      { key: "eventKey", label: "Событие", sortable: true, filterKind: "text" },
      { key: "category", label: "Категория", sortable: true, filterKind: "text" },
      { key: "channel", label: "Куда", sortable: true, filterKind: "text" },
      { key: "status", label: "Итог", sortable: true, filterKind: "text" },
      { key: "detail", label: "Причина / тема", sortable: false, filterKind: "text" },
      { key: "preview", label: "Текст", sortable: false, filterKind: "none" },
    ],
    [],
  );

  const tableRows: AdminCompactRow[] = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        cells: {
          createdAt: { value: formatMoscow(row.createdAt), sortValue: row.createdAt },
          recipient: { value: row.recipient, sortValue: row.recipient },
          eventKey: { value: row.eventKey, sortValue: row.eventKey },
          category: { value: row.category, sortValue: row.category },
          channel: { value: row.channel, sortValue: row.channel },
          status: {
            kind: "status" as const,
            label: STATUS_LABELS[row.status] ?? row.status,
            tone: STATUS_TONE[row.status] ?? "neutral",
            filterValue: STATUS_LABELS[row.status] ?? row.status,
            sortValue: row.status,
          },
          detail: {
            value: row.blockedBy ?? row.error ?? row.subject ?? "—",
            sortValue: row.blockedBy ?? row.subject ?? "",
          },
          preview: {
            kind: "actions" as const,
            actions: [
              {
                label: row.body ? "Показать" : "Нет тела",
                onClick: () => setPreview(row),
                disabled: !row.body,
              },
            ],
          },
        },
      })),
    [rows],
  );

  return (
    <>
      <AdminCompactDataTable
        columns={columns}
        rows={tableRows}
        pageSize={25}
        minWidth="1100px"
        empty="Пока ничего не отправлялось — рассылка выключена"
      />

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Текст сообщения"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 dark:bg-neutral-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  {preview.eventKey} · {preview.channel} · {formatMoscow(preview.createdAt)}
                </p>
                <h3 className="mt-1 text-lg font-semibold">{preview.subject ?? "Без темы"}</h3>
                <p className="text-sm text-neutral-500">{preview.recipient}</p>
              </div>
              <button type="button" className="soft-chip" onClick={() => setPreview(null)}>
                Закрыть
              </button>
            </div>

            {preview.body ? (
              <iframe
                sandbox=""
                title="Текст сообщения как он ушёл"
                srcDoc={preview.body}
                className="mt-4 h-[50vh] w-full rounded-xl border border-neutral-200 bg-white dark:border-neutral-800"
              />
            ) : (
              <p className="mt-4 text-sm text-neutral-500">
                Тела нет: сообщение не отправлялось
                {preview.blockedBy ? ` — ${preview.blockedBy}` : ""}.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
