"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, EyeOff, Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CompactPaginationBar } from "@/components/admin/compact-table";

interface AdminReview {
  id: string;
  rating: number;
  text: string | null;
  status: string;
  riskScore: number;
  riskFlags: string[];
  createdAt: string;
  authorName: string;
  authorEmail: string;
  practitionerName: string;
  practitionerSlug: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  PUBLISHED: { label: "Опубликован", className: "text-emerald-600" },
  REVIEW: { label: "На проверке", className: "text-amber-600" },
  HIDDEN: { label: "Скрыт", className: "text-muted-foreground" },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "Все" },
  { key: "REVIEW", label: "На проверке" },
  { key: "PUBLISHED", label: "Опубликованные" },
  { key: "HIDDEN", label: "Скрытые" },
];

const PAGE_SIZE = 20;

// R2: show the exact time, not just the date.
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SortField = "rating" | "text" | "author" | "practitioner" | "createdAt" | "status";
type SortDirection = "asc" | "desc";

export function ReviewsManager({
  reviews: initial,
  canDelete,
}: {
  reviews: AdminReview[];
  canDelete: boolean;
}) {
  const [reviews, setReviews] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [practitioner, setPractitioner] = useState("all");
  const [practitionerQuery, setPractitionerQuery] = useState("");
  const [authorQuery, setAuthorQuery] = useState("");
  const [ratingQuery, setRatingQuery] = useState("");
  const [textQuery, setTextQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // V4: inline redaction of review text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // R1/V4: practitioners present in the reviews, sorted alphabetically (RU) for
  // the dropdown. A name search keeps the dropdown usable when the list is long.
  const practitioners = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reviews) {
      if (r.practitionerSlug) map.set(r.practitionerSlug, r.practitionerName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [reviews]);

  const visible = useMemo(() => {
    const author = authorQuery.trim().toLowerCase();
    const prac = practitionerQuery.trim().toLowerCase();
    const rating = ratingQuery.trim();
    const text = textQuery.trim().toLowerCase();
    const date = dateQuery.trim().toLowerCase();
    const list = reviews.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (practitioner !== "all" && r.practitionerSlug !== practitioner) return false;
      if (rating && !String(r.rating).includes(rating)) return false;
      if (text && !(r.text ?? "").toLowerCase().includes(text)) return false;
      if (prac && !r.practitionerName.toLowerCase().includes(prac)) return false;
      if (author && !r.authorName.toLowerCase().includes(author) && !r.authorEmail.toLowerCase().includes(author)) return false;
      if (date && !formatDateTime(r.createdAt).toLowerCase().includes(date)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      let result = 0;
      if (sortField === "rating") result = a.rating - b.rating;
      if (sortField === "text") result = (a.text ?? "").localeCompare(b.text ?? "", "ru");
      if (sortField === "author") result = `${a.authorName} ${a.authorEmail}`.localeCompare(`${b.authorName} ${b.authorEmail}`, "ru");
      if (sortField === "practitioner") result = a.practitionerName.localeCompare(b.practitionerName, "ru");
      if (sortField === "status") result = (STATUS_META[a.status]?.label ?? a.status).localeCompare(STATUS_META[b.status]?.label ?? b.status, "ru");
      if (sortField === "createdAt") result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? result : -result;
    });
  }, [reviews, filter, practitioner, practitionerQuery, authorQuery, ratingQuery, textQuery, dateQuery, sortField, sortDir]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Any filter change returns to the first page.
  function resetPage<T>(setter: (v: T) => void) {
    return (value: T) => { setter(value); setPage(1); };
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "createdAt" ? "desc" : "asc");
    }
  }

  function sortMark(field: SortField) {
    if (sortField !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  async function setStatus(id: string, status: string) {
    const prev = reviews;
    setBusyId(id);
    setReviews((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Статус обновлён: ${STATUS_META[status]?.label ?? status}`);
    } catch {
      setReviews(prev);
      toast.error("Не удалось обновить статус");
    } finally {
      setBusyId(null);
    }
  }

  async function saveText(id: string) {
    const prev = reviews;
    const next = editText.trim();
    setBusyId(id);
    setReviews((rows) => rows.map((r) => (r.id === id ? { ...r, text: next || null } : r)));
    setEditingId(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Текст отзыва обновлён");
    } catch {
      setReviews(prev);
      toast.error("Не удалось сохранить текст");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    const prev = reviews;
    setBusyId(id);
    setReviews((rows) => rows.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Отзыв удалён");
    } catch {
      setReviews(prev);
      toast.error("Не удалось удалить отзыв");
    } finally {
      setBusyId(null);
    }
  }

  const TH = "p-0 align-top text-left";
  const TD = "px-2.5 py-2 align-top";
  const ACTION = "soft-admin-icon-button disabled:cursor-not-allowed disabled:opacity-40";
  const HEADER_BUTTON = "flex h-7 w-full items-center justify-between gap-1 px-2 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]";
  const FILTER_INPUT = "soft-admin-table-filter mt-0";

  return (
    <div data-testid="admin-reviews-manager">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-[var(--soft-ink-soft)]">
        <span>Найдено: {visible.length}</span>
        <span data-testid="reviews-sort" className="sr-only">Сортировка: {sortField} {sortDir}</span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
          Нет отзывов в этой категории
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)]">
            <table className="soft-admin-data-table min-w-[1120px]">
              <thead>
                <tr>
                  <th className={TH}>
                    <button type="button" className={HEADER_BUTTON} onClick={() => toggleSort("rating")}>Оценка <span>{sortMark("rating")}</span></button>
                    <input className={FILTER_INPUT} value={ratingQuery} onChange={(e) => resetPage(setRatingQuery)(e.target.value)} placeholder="1-5" />
                  </th>
                  <th className={TH}>
                    <button type="button" className={HEADER_BUTTON} onClick={() => toggleSort("text")}>Отзыв <span>{sortMark("text")}</span></button>
                    <input className={FILTER_INPUT} value={textQuery} onChange={(e) => resetPage(setTextQuery)(e.target.value)} placeholder="текст" />
                  </th>
                  <th className={TH}>
                    <button type="button" className={HEADER_BUTTON} onClick={() => toggleSort("author")}>Автор <span>{sortMark("author")}</span></button>
                    <input className={FILTER_INPUT} value={authorQuery} onChange={(e) => resetPage(setAuthorQuery)(e.target.value)} placeholder="имя/email" data-testid="reviews-filter-author" />
                  </th>
                  <th className={TH}>
                    <button type="button" className={HEADER_BUTTON} onClick={() => toggleSort("practitioner")}>Практик <span>{sortMark("practitioner")}</span></button>
                    <select className={FILTER_INPUT} value={practitioner} onChange={(e) => resetPage(setPractitioner)(e.target.value)} data-testid="reviews-filter-practitioner">
                      <option value="all">Все практики</option>
                      {practitioners.map(([slug, name]) => (
                        <option key={slug} value={slug}>{name}</option>
                      ))}
                    </select>
                    <input className={FILTER_INPUT} value={practitionerQuery} onChange={(e) => resetPage(setPractitionerQuery)(e.target.value)} placeholder="имя" data-testid="reviews-filter-practitioner-search" />
                  </th>
                  <th className={TH}>
                    <button type="button" className={HEADER_BUTTON} onClick={() => toggleSort("createdAt")}>Дата <span>{sortMark("createdAt")}</span></button>
                    <input className={FILTER_INPUT} value={dateQuery} onChange={(e) => resetPage(setDateQuery)(e.target.value)} placeholder="дд.мм" />
                  </th>
                  <th className={TH}>
                    <button type="button" className={HEADER_BUTTON} onClick={() => toggleSort("status")}>Статус <span>{sortMark("status")}</span></button>
                    <select className={FILTER_INPUT} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
                      {FILTERS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                    </select>
                  </th>
                  <th className={`${TH} text-right`}>
                    <div className={HEADER_BUTTON}>Действия</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {pageRows.map((r) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.HIDDEN;
                  const busy = busyId === r.id;
                  const editing = editingId === r.id;
                  return (
                    <tr key={r.id} data-testid="admin-review-row" className="hover:bg-muted/10">
                      <td className={`${TD} whitespace-nowrap`}>
                        <span className="text-amber-500" aria-label={`${r.rating} из 5`}>
                          {"★".repeat(r.rating)}<span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span>
                        </span>
                        {r.riskScore >= 50 && (
                          <span className="ml-1 text-xs font-medium text-red-500">риск {r.riskScore}</span>
                        )}
                      </td>
                      <td className={`${TD} min-w-[16rem] max-w-[28rem]`}>
                        {editing ? (
                          <div className="space-y-1.5">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={3}
                              maxLength={2000}
                              className="w-full rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-sm"
                              aria-label="Текст отзыва"
                            />
                            <div className="soft-admin-table-actions justify-start">
                              <button type="button" disabled={busy} onClick={() => saveText(r.id)} className={ACTION} data-variant="primary" title="Сохранить" aria-label="Сохранить отзыв">
                                <Save className="size-3.5" aria-hidden="true" />
                              </button>
                              <button type="button" disabled={busy} onClick={() => setEditingId(null)} className={ACTION} title="Отмена" aria-label="Отменить редактирование">
                                <X className="size-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="line-clamp-2 text-foreground" title={r.text ?? ""}>
                            {r.text ? r.text : <span className="italic text-muted-foreground">без текста</span>}
                          </p>
                        )}
                        {r.riskFlags.length > 0 && !editing && (
                          <p className="mt-1 text-xs text-red-400">{r.riskFlags.join(", ")}</p>
                        )}
                      </td>
                      <td className={`${TD} min-w-[10rem]`}>
                        <div className="text-foreground">{r.authorName}</div>
                        {r.authorEmail && <div className="text-xs text-muted-foreground">{r.authorEmail}</div>}
                      </td>
                      <td className={`${TD} whitespace-nowrap font-medium text-foreground`}>{r.practitionerName}</td>
                      <td className={`${TD} whitespace-nowrap text-xs text-muted-foreground`}>{formatDateTime(r.createdAt)}</td>
                      <td className={`${TD} whitespace-nowrap font-medium ${meta.className}`}>{meta.label}</td>
                      <td className={`${TD} text-right`}>
                        <div className="soft-admin-table-actions">
                          <button type="button" disabled={busy || r.status === "PUBLISHED"} onClick={() => setStatus(r.id, "PUBLISHED")} className={ACTION} data-variant="primary" title="Опубликовать" aria-label="Опубликовать отзыв">
                            <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          </button>
                          <button type="button" disabled={busy || r.status === "HIDDEN"} onClick={() => setStatus(r.id, "HIDDEN")} className={ACTION} title="Скрыть" aria-label="Скрыть отзыв">
                            <EyeOff className="size-3.5" aria-hidden="true" />
                          </button>
                          <button type="button" disabled={busy} onClick={() => { setEditingId(r.id); setEditText(r.text ?? ""); }} className={ACTION} title="Изменить" aria-label="Изменить отзыв">
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </button>
                          {canDelete && (
                            <button type="button" disabled={busy} onClick={() => remove(r.id)} className={ACTION} data-variant="danger" title="Удалить" aria-label="Удалить отзыв">
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <CompactPaginationBar page={safePage} total={visible.length} pageSize={PAGE_SIZE} onPage={setPage} />
          )}
        </>
      )}
    </div>
  );
}
