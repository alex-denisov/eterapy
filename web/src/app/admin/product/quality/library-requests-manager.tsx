"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpenText, CheckCircle2, EyeOff } from "lucide-react";
import {
  CompactHeader,
  CompactPaginationBar,
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_INPUT_CLASS,
  COMPACT_SELECT_CLASS,
} from "@/components/admin/compact-table";
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
const PAGE_SIZE = 20;

export function LibraryRequestsManager({ rows: initialRows }: { rows: LibraryRequestRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    question: "",
    author: "",
    status: "all",
    consentAt: "",
    createdAt: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;
      return [
        [filters.question, `${row.title} ${row.question}`],
        [filters.author, `${row.userName} ${row.userEmail}`],
        [filters.consentAt, formatDateTime(row.consentAt)],
        [filters.createdAt, formatDateTime(row.createdAt)],
      ].every(([filter, value]) => !filter || value.toLowerCase().includes(filter.toLowerCase()));
    });
  }, [filters, rows]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
      <CompactTableShell minWidth="980px">
          <thead>
            <tr>
              <CompactHeader label="Вопрос">
                <HeaderTextFilter value={filters.question} placeholder="вопрос" onChange={(value) => { setFilters((current) => ({ ...current, question: value })); setPage(1); }} />
              </CompactHeader>
              <CompactHeader label="Автор">
                <HeaderTextFilter value={filters.author} placeholder="имя/email" onChange={(value) => { setFilters((current) => ({ ...current, author: value })); setPage(1); }} />
              </CompactHeader>
              <CompactHeader label="Статус">
                <div className="p-1 pt-0">
                  <select
                    className={COMPACT_SELECT_CLASS}
                    value={filters.status}
                    onChange={(event) => { setFilters((current) => ({ ...current, status: event.target.value })); setPage(1); }}
                  >
                    {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </CompactHeader>
              <CompactHeader label="Согласие">
                <HeaderTextFilter value={filters.consentAt} placeholder="дд.мм.гггг" onChange={(value) => { setFilters((current) => ({ ...current, consentAt: value })); setPage(1); }} />
              </CompactHeader>
              <CompactHeader label="Создано">
                <HeaderTextFilter value={filters.createdAt} placeholder="дд.мм.гггг" onChange={(value) => { setFilters((current) => ({ ...current, createdAt: value })); setPage(1); }} />
              </CompactHeader>
              <CompactHeader label="Действия" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className={`${COMPACT_CELL_CLASS} py-8 text-center text-[var(--soft-ink-soft)]`}>Заявок на публикацию нет</td>
              </tr>
            ) : pageRows.map((row) => (
              <tr key={row.id}>
                <td className={`${COMPACT_CELL_CLASS} max-w-[28rem]`}>
                  <div className="flex items-start gap-2">
                    <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--soft-bordeaux)]" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--soft-ink)]">{row.title}</p>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{row.question}</p>
                    </div>
                  </div>
                </td>
                <td className={COMPACT_CELL_CLASS}>
                  <p className="text-xs font-medium text-[var(--soft-ink)]">{row.userName}</p>
                  <p className="text-[10px] text-[var(--soft-ink-faint)]">{row.userEmail}</p>
                </td>
                <td className={COMPACT_CELL_CLASS}><StatusBadge status={row.status} /></td>
                <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap text-xs text-[var(--soft-ink-soft)]`}>{formatDateTime(row.consentAt)}</td>
                <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap text-xs text-[var(--soft-ink-soft)]`}>{formatDateTime(row.createdAt)}</td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
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
      </CompactTableShell>
      <CompactPaginationBar page={safePage} total={visible.length} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}

function HeaderTextFilter({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="p-1 pt-0">
      <input
        className={COMPACT_INPUT_CLASS}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
