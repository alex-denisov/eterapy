"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";

export type AdminJobTableRow = {
  id: string;
  queue: string;
  type: string;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedBy: string | null;
  error: string | null;
  updatedAt: string;
};

export type AdminNotificationJobTableRow = {
  id: string;
  event: string;
  channel: string;
  recipient: string;
  recipientRole: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  requestId: string;
  runAfter: string;
  error: string | null;
  updatedAt: string;
};

const statusOptions = [
  { value: "PENDING", label: "Ожидает" },
  { value: "RUNNING", label: "В работе" },
  { value: "SUCCEEDED", label: "Успешно" },
  { value: "FAILED", label: "Ошибка" },
  { value: "DEAD", label: "Dead" },
];

const jobColumns: AdminCompactColumn[] = [
  { key: "queue", label: "Очередь", sortable: true },
  { key: "type", label: "Тип", sortable: true },
  { key: "status", label: "Статус", sortable: true, filterKind: "select", options: statusOptions },
  { key: "attempts", label: "Попытки", sortable: true, align: "right" },
  { key: "priority", label: "Приоритет", sortable: true, align: "right" },
  { key: "runAfter", label: "Run after", sortable: true, filterKind: "date" },
  { key: "lockedBy", label: "Locked", sortable: true },
  { key: "updatedAt", label: "Обновлено", sortable: true, filterKind: "date" },
  { key: "error", label: "Ошибка", sortable: true },
  { key: "actions", label: "Действия", filterKind: "none", align: "center" },
];

const notificationColumns: AdminCompactColumn[] = [
  { key: "event", label: "Событие", sortable: true },
  { key: "channel", label: "Канал", sortable: true },
  { key: "recipient", label: "Кому", sortable: true },
  { key: "status", label: "Статус", sortable: true, filterKind: "select", options: statusOptions },
  { key: "attempts", label: "Retry", sortable: true, align: "right" },
  { key: "requestId", label: "Request", sortable: true },
  { key: "runAfter", label: "Run after", sortable: true, filterKind: "date" },
  { key: "updatedAt", label: "Обновлено", sortable: true, filterKind: "date" },
  { key: "error", label: "Ошибка", sortable: true },
  { key: "actions", label: "Действия", filterKind: "none", align: "center" },
];

function statusTone(status: string) {
  if (status === "SUCCEEDED") return "ok" as const;
  if (status === "FAILED" || status === "DEAD") return "danger" as const;
  return "warn" as const;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "medium" });
}

function canRequeue(status: string) {
  return status === "FAILED" || status === "DEAD";
}

export function AdminJobsTable({ rows }: { rows: AdminJobTableRow[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function requeue(jobId: string) {
    if (!confirm("Повторить задачу? Она будет поставлена в очередь заново.")) return;
    setLoadingId(jobId);
    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/requeue`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        alert(payload.error ?? "Не удалось повторить задачу");
        return;
      }
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <AdminCompactDataTable
      columns={jobColumns}
      rows={rows.map((job) => ({
        id: job.id,
        cells: {
          queue: job.queue,
          type: { value: job.type, filterValue: `${job.type} ${job.id}` },
          status: { kind: "status", label: job.status, tone: statusTone(job.status), filterValue: job.status },
          attempts: { value: `${job.attempts}/${job.maxAttempts}`, sortValue: job.attempts },
          priority: { value: job.priority, sortValue: job.priority },
          runAfter: { value: formatDateTime(job.runAfter), sortValue: new Date(job.runAfter).getTime(), filterValue: formatDateTime(job.runAfter) },
          lockedBy: job.lockedBy ?? "нет",
          updatedAt: { value: formatDateTime(job.updatedAt), sortValue: new Date(job.updatedAt).getTime(), filterValue: formatDateTime(job.updatedAt) },
          error: { value: job.error ?? "нет", filterValue: job.error ?? "", title: job.error ?? "" },
          actions: {
            kind: "actions",
            actions: canRequeue(job.status) ? [{
              label: "Повторить",
              icon: "refresh",
              disabled: loadingId === job.id,
              onClick: () => { void requeue(job.id); },
            }] : [],
          },
        },
      }))}
      empty="Задачи не найдены"
      minWidth="1240px"
    />
  );
}

export function AdminNotificationJobsTable({ rows }: { rows: AdminNotificationJobTableRow[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function requeue(jobId: string) {
    if (!confirm("Отправить уведомление повторно?")) return;
    setLoadingId(jobId);
    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/requeue`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        alert(payload.error ?? "Не удалось повторить задачу");
        return;
      }
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <AdminCompactDataTable
      columns={notificationColumns}
      rows={rows.map((job) => ({
        id: job.id,
        cells: {
          event: job.event,
          channel: job.channel,
          recipient: { value: job.recipient, subvalue: job.recipientRole, filterValue: `${job.recipient} ${job.recipientRole}` },
          status: { kind: "status", label: job.status, tone: statusTone(job.status), filterValue: job.status },
          attempts: { value: `${job.attempts}/${job.maxAttempts}`, sortValue: job.attempts },
          requestId: job.requestId,
          runAfter: { value: formatDateTime(job.runAfter), sortValue: new Date(job.runAfter).getTime(), filterValue: formatDateTime(job.runAfter) },
          updatedAt: { value: formatDateTime(job.updatedAt), sortValue: new Date(job.updatedAt).getTime(), filterValue: formatDateTime(job.updatedAt) },
          error: { value: job.error ?? "нет", filterValue: job.error ?? "", title: job.error ?? "" },
          actions: {
            kind: "actions",
            actions: canRequeue(job.status) ? [{
              label: "Отправить",
              icon: "refresh",
              disabled: loadingId === job.id,
              onClick: () => { void requeue(job.id); },
            }] : [],
          },
        },
      }))}
      empty="Delivery jobs пока нет"
      minWidth="1320px"
    />
  );
}
