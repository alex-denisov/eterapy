"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { formatDateTime, statusLabel } from "../../admin-analytics-ui";

export interface LibraryRequestRow {
  id: string;
  title: string;
  question: string;
  userName: string;
  userEmail: string;
  status: string;
  consentAt: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = [
  { value: "PENDING_REVIEW", label: "На модерации" },
  { value: "PUBLISHED", label: "Опубликовано" },
  { value: "WITHDRAWN", label: "Снято" },
];

const libraryRequestColumns: AdminCompactColumn[] = [
  { key: "question", label: "Вопрос", sortable: true },
  { key: "author", label: "Автор", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: STATUS_OPTIONS,
  },
  { key: "consentAt", label: "Согласие", sortable: true, filterKind: "date" },
  { key: "createdAt", label: "Создано", sortable: true, filterKind: "date" },
  { key: "actions", label: "Действия", filterKind: "none", align: "center" },
];

export function LibraryRequestsManager({ rows: initialRows }: { rows: LibraryRequestRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function updateStatus(id: string, nextStatus: "PUBLISHED" | "WITHDRAWN" | "PENDING_REVIEW") {
    const previous = rows;
    setBusyId(id);
    setRows((items) => items.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
    try {
      const response = await fetch(`/api/admin/library-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(typeof data.error === "string" ? data.error : "Не удалось обновить");
      toast.success(nextStatus === "PUBLISHED" ? "Вопрос опубликован" : nextStatus === "WITHDRAWN" ? "Вопрос снят с публикации" : "Вопрос возвращен на модерацию");
    } catch (error) {
      setRows(previous);
      toast.error(error instanceof Error ? error.message : "Не удалось обновить статус");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div data-testid="admin-library-requests-manager">
      <AdminCompactDataTable
        columns={libraryRequestColumns}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            question: {
              value: row.title,
              subvalue: row.question,
              title: row.question,
              filterValue: `${row.title} ${row.question}`,
            },
            author: {
              value: row.userName,
              subvalue: row.userEmail,
              filterValue: `${row.userName} ${row.userEmail}`,
            },
            status: {
              kind: "status",
              label: statusLabel(row.status),
              tone: row.status === "PUBLISHED" ? "ok" : row.status === "WITHDRAWN" ? "neutral" : "warn",
              filterValue: `${row.status} ${statusLabel(row.status)}`,
            },
            consentAt: {
              value: formatDateTime(row.consentAt),
              sortValue: row.consentAt ? new Date(row.consentAt).getTime() : -1,
              filterValue: formatDateTime(row.consentAt),
            },
            createdAt: {
              value: formatDateTime(row.createdAt),
              sortValue: new Date(row.createdAt).getTime(),
              filterValue: formatDateTime(row.createdAt),
            },
            actions: {
              kind: "actions",
              actions: [
                {
                  label: "Опубликовать",
                  icon: "check",
                  variant: "primary",
                  onClick: () => updateStatus(row.id, "PUBLISHED"),
                  disabled: busyId === row.id || row.status === "PUBLISHED",
                },
                {
                  label: "Снять",
                  icon: "cancel",
                  onClick: () => updateStatus(row.id, "WITHDRAWN"),
                  disabled: busyId === row.id || row.status === "WITHDRAWN",
                },
              ],
            },
          },
        }))}
        empty="Заявок на публикацию нет"
        minWidth="1120px"
      />
    </div>
  );
}
