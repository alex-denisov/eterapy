"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

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

const PAGE_SIZE = 25;

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

type SortMode = "date-desc" | "date-asc" | "rating-desc" | "rating-asc";

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
  const [sort, setSort] = useState<SortMode>("date-desc");
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
    const list = reviews.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (practitioner !== "all" && r.practitionerSlug !== practitioner) return false;
      if (prac && !r.practitionerName.toLowerCase().includes(prac)) return false;
      if (author && !r.authorName.toLowerCase().includes(author) && !r.authorEmail.toLowerCase().includes(author)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "rating-desc") return b.rating - a.rating;
      if (sort === "rating-asc") return a.rating - b.rating;
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sort === "date-asc" ? ta - tb : tb - ta;
    });
  }, [reviews, filter, practitioner, practitionerQuery, authorQuery, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Any filter change returns to the first page.
  function resetPage<T>(setter: (v: T) => void) {
    return (value: T) => { setter(value); setPage(1); };
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

  const TH = "px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground";
  const TD = "px-2.5 py-2 align-top";
  const ACTION = "rounded-md px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div data-testid="admin-reviews-manager">
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              filter === f.key
                ? "bg-foreground text-background"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* R1/V4: practitioner dropdown (alphabetical) + practitioner name search +
          author search + sort. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={practitioner}
          onChange={(e) => resetPage(setPractitioner)(e.target.value)}
          aria-label="Фильтр по практику"
          className="rounded-lg border border-border/60 bg-card/40 px-3 py-1.5 text-sm"
          data-testid="reviews-filter-practitioner"
        >
          <option value="all">Все практики</option>
          {practitioners.map(([slug, name]) => (
            <option key={slug} value={slug}>{name}</option>
          ))}
        </select>
        <input
          type="search"
          value={practitionerQuery}
          onChange={(e) => resetPage(setPractitionerQuery)(e.target.value)}
          placeholder="Практик: имя или фамилия"
          aria-label="Поиск по имени практика"
          className="rounded-lg border border-border/60 bg-card/40 px-3 py-1.5 text-sm"
          data-testid="reviews-filter-practitioner-search"
        />
        <input
          type="search"
          value={authorQuery}
          onChange={(e) => resetPage(setAuthorQuery)(e.target.value)}
          placeholder="Автор: имя или email"
          aria-label="Поиск по автору отзыва"
          className="rounded-lg border border-border/60 bg-card/40 px-3 py-1.5 text-sm"
          data-testid="reviews-filter-author"
        />
        <select
          value={sort}
          onChange={(e) => resetPage(setSort)(e.target.value as SortMode)}
          aria-label="Сортировка"
          className="ml-auto rounded-lg border border-border/60 bg-card/40 px-3 py-1.5 text-sm"
          data-testid="reviews-sort"
        >
          <option value="date-desc">Сначала новые</option>
          <option value="date-asc">Сначала старые</option>
          <option value="rating-desc">Оценка: высокая → низкая</option>
          <option value="rating-asc">Оценка: низкая → высокая</option>
        </select>
        <span className="text-xs text-muted-foreground">{visible.length}</span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
          Нет отзывов в этой категории
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead className="bg-muted/20">
                <tr>
                  <th className={TH}>Оценка</th>
                  <th className={TH}>Отзыв</th>
                  <th className={TH}>Автор</th>
                  <th className={TH}>Практик</th>
                  <th className={TH}>Дата</th>
                  <th className={TH}>Статус</th>
                  <th className={`${TH} text-right`}>Действия</th>
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
                            <div className="flex gap-2">
                              <button type="button" disabled={busy} onClick={() => saveText(r.id)} className={`${ACTION} bg-foreground text-background`}>Сохранить</button>
                              <button type="button" disabled={busy} onClick={() => setEditingId(null)} className={`${ACTION} bg-muted/30 text-muted-foreground hover:bg-muted/50`}>Отмена</button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-foreground">
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
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button type="button" disabled={busy || r.status === "PUBLISHED"} onClick={() => setStatus(r.id, "PUBLISHED")} className={`${ACTION} border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20`}>Опубликовать</button>
                          <button type="button" disabled={busy || r.status === "HIDDEN"} onClick={() => setStatus(r.id, "HIDDEN")} className={`${ACTION} border border-border bg-muted/30 text-muted-foreground hover:bg-muted/50`}>Скрыть</button>
                          <button type="button" disabled={busy} onClick={() => { setEditingId(r.id); setEditText(r.text ?? ""); }} className={`${ACTION} border border-border bg-card/40 text-foreground hover:bg-muted/40`}>Изменить</button>
                          {canDelete && (
                            <button type="button" disabled={busy} onClick={() => remove(r.id)} className={`${ACTION} border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20`}>Удалить</button>
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
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className={`${ACTION} border border-border bg-card/40 text-foreground hover:bg-muted/40`}>Назад</button>
              <span className="text-xs text-muted-foreground">Страница {safePage} / {pageCount}</span>
              <button type="button" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className={`${ACTION} border border-border bg-card/40 text-foreground hover:bg-muted/40`}>Вперёд</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
