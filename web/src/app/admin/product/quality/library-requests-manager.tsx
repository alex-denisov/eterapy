"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpenText, CheckCircle2, EyeOff } from "lucide-react";
import { StatusBadge, formatDateTime } from "../../admin-analytics-ui";

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
  { value: "all", label: "Все" },
  { value: "PENDING_REVIEW", label: "На модерации" },
  { value: "PUBLISHED", label: "Опубликовано" },
  { value: "WITHDRAWN", label: "Снято" },
];

export function LibraryRequestsManager({ rows: initialRows }: { rows: LibraryRequestRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [row.title, row.question, row.userName, row.userEmail]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [query, rows, status]);

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
    <div className="space-y-3" data-testid="admin-library-requests-manager">
      <div className="flex flex-wrap items-center gap-2">
        <div className="soft-admin-seg">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="soft-admin-seg-btn"
              data-active={status === option.value}
              onClick={() => setStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="soft-admin-table-filter mt-0 ml-auto h-8 w-72"
          placeholder="Поиск: вопрос, клиент, email"
          aria-label="Поиск по заявкам библиотеки"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)]">
        <table className="soft-admin-data-table min-w-[980px]">
          <thead>
            <tr>
              <th>Вопрос</th>
              <th>Автор</th>
              <th>Статус</th>
              <th>Согласие</th>
              <th>Создано</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--soft-ink-soft)]">Заявок на публикацию нет</td>
              </tr>
            ) : visible.map((row) => (
              <tr key={row.id}>
                <td className="max-w-[28rem]">
                  <div className="flex items-start gap-2">
                    <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--soft-bordeaux)]" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--soft-ink)]">{row.title}</p>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{row.question}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <p className="text-xs font-medium text-[var(--soft-ink)]">{row.userName}</p>
                  <p className="text-[10px] text-[var(--soft-ink-faint)]">{row.userEmail}</p>
                </td>
                <td><StatusBadge status={row.status} /></td>
                <td className="whitespace-nowrap text-xs text-[var(--soft-ink-soft)]">{formatDateTime(row.consentAt)}</td>
                <td className="whitespace-nowrap text-xs text-[var(--soft-ink-soft)]">{formatDateTime(row.createdAt)}</td>
                <td>
                  <div className="soft-admin-table-actions">
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status === "PUBLISHED"}
                      onClick={() => updateStatus(row.id, "PUBLISHED")}
                      className="soft-admin-icon-button"
                      data-variant="primary"
                      title="Опубликовать"
                      aria-label="Опубликовать вопрос"
                    >
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status === "WITHDRAWN"}
                      onClick={() => updateStatus(row.id, "WITHDRAWN")}
                      className="soft-admin-icon-button"
                      title="Снять"
                      aria-label="Снять вопрос с публикации"
                    >
                      <EyeOff className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
