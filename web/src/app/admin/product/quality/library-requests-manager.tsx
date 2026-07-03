"use client";

import { useState } from "react";
import { Save, X } from "lucide-react";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editQuestion, setEditQuestion] = useState("");

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

  function startEdit(row: LibraryRequestRow) {
    setEditingId(row.id);
    setEditTitle(row.title);
    setEditQuestion(row.question);
  }

  async function saveQuestion(id: string) {
    const title = editTitle.trim();
    const question = editQuestion.trim();
    if (!title || !question) {
      toast.error("Заголовок и вопрос не могут быть пустыми");
      return;
    }
    const previous = rows;
    setBusyId(id);
    setRows((items) => items.map((item) => (item.id === id ? { ...item, title, question } : item)));
    setEditingId(null);
    try {
      const response = await fetch(`/api/admin/library-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, question }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(typeof data.error === "string" ? data.error : "Не удалось сохранить вопрос");
      toast.success("Вопрос обновлен");
    } catch (error) {
      setRows(previous);
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить вопрос");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div data-testid="admin-library-requests-manager">
      <AdminCompactDataTable
        columns={libraryRequestColumns}
        rows={rows.map((row) => {
          const editing = editingId === row.id;
          const busy = busyId === row.id;
          return ({
            id: row.id,
            cells: {
              question: editing ? {
                kind: "node",
                filterValue: `${row.title} ${row.question}`,
                sortValue: row.title,
                node: (
                  <span className="grid min-w-[22rem] gap-2">
                    <input
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      className="rounded-md border border-[var(--soft-paper-edge)] bg-white px-2 py-1 text-sm"
                      aria-label="Заголовок вопроса"
                    />
                    <textarea
                      value={editQuestion}
                      onChange={(event) => setEditQuestion(event.target.value)}
                      rows={4}
                      className="rounded-md border border-[var(--soft-paper-edge)] bg-white px-2 py-1 text-sm"
                      aria-label="Текст вопроса"
                    />
                    <span className="soft-admin-table-actions justify-start">
                      <button type="button" className="soft-admin-icon-button" data-variant="primary" disabled={busy} onClick={() => void saveQuestion(row.id)} title="Сохранить" aria-label="Сохранить вопрос">
                        <Save className="size-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" className="soft-admin-icon-button" disabled={busy} onClick={() => setEditingId(null)} title="Отмена" aria-label="Отменить редактирование">
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  </span>
                ),
              } : {
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
                    label: "Изменить",
                    icon: "edit",
                    onClick: () => startEdit(row),
                    disabled: busy || editing,
                  },
                  {
                    label: "Опубликовать",
                    icon: "check",
                    variant: "primary",
                    onClick: () => updateStatus(row.id, "PUBLISHED"),
                    disabled: busy || row.status === "PUBLISHED",
                  },
                  {
                    label: "Снять",
                    icon: "cancel",
                    onClick: () => updateStatus(row.id, "WITHDRAWN"),
                    disabled: busy || row.status === "WITHDRAWN",
                  },
                ],
              },
            },
          });
        })}
        empty="Заявок на публикацию нет"
        minWidth="1120px"
      />
    </div>
  );
}
