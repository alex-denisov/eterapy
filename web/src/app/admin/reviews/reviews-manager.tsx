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

const STATUS_META: Record<string, { label: string; color: string }> = {
  PUBLISHED: { label: "Опубликован", color: "bg-green-500/10 text-green-500" },
  REVIEW: { label: "На проверке", color: "bg-amber-500/10 text-amber-500" },
  HIDDEN: { label: "Скрыт", color: "bg-muted/20 text-muted-foreground" },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "Все" },
  { key: "REVIEW", label: "На проверке" },
  { key: "PUBLISHED", label: "Опубликованные" },
  { key: "HIDDEN", label: "Скрытые" },
];

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
  const [authorQuery, setAuthorQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("date-desc");
  const [busyId, setBusyId] = useState<string | null>(null);

  // R1: list of practitioners present in the reviews, for the dropdown filter.
  const practitioners = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reviews) {
      if (r.practitionerSlug) map.set(r.practitionerSlug, r.practitionerName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [reviews]);

  const visible = useMemo(() => {
    const q = authorQuery.trim().toLowerCase();
    const list = reviews.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (practitioner !== "all" && r.practitionerSlug !== practitioner) return false;
      if (q && !r.authorName.toLowerCase().includes(q) && !r.authorEmail.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "rating-desc") return b.rating - a.rating;
      if (sort === "rating-asc") return a.rating - b.rating;
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sort === "date-asc" ? ta - tb : tb - ta;
    });
  }, [reviews, filter, practitioner, authorQuery, sort]);

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

  return (
    <div data-testid="admin-reviews-manager">
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
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

      {/* R1: filter by practitioner / author, and sort by date or rating. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={practitioner}
          onChange={(e) => setPractitioner(e.target.value)}
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
          value={authorQuery}
          onChange={(e) => setAuthorQuery(e.target.value)}
          placeholder="Автор: имя или email"
          aria-label="Поиск по автору отзыва"
          className="rounded-lg border border-border/60 bg-card/40 px-3 py-1.5 text-sm"
          data-testid="reviews-filter-author"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
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
        <div className="space-y-3">
          {visible.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.HIDDEN;
            const busy = busyId === r.id;
            return (
              <article
                key={r.id}
                data-testid="admin-review-row"
                className="rounded-xl border border-border/60 bg-card/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-500" aria-label={`${r.rating} из 5`}>
                        {"★".repeat(r.rating)}
                        <span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                      {r.riskScore >= 50 && (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
                          риск {r.riskScore}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-foreground">
                      {r.text ? r.text : <span className="text-muted-foreground italic">без текста</span>}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {r.authorName}{r.authorEmail ? ` (${r.authorEmail})` : ""} → практик{" "}
                      <strong>{r.practitionerName}</strong> · {formatDateTime(r.createdAt)}
                    </p>
                    {r.riskFlags.length > 0 && (
                      <p className="mt-1 text-xs text-red-400">{r.riskFlags.join(", ")}</p>
                    )}
                  </div>

                  <div className="flex flex-shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || r.status === "PUBLISHED"}
                      onClick={() => setStatus(r.id, "PUBLISHED")}
                      className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-sm text-green-500 transition-colors hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Опубликовать
                    </button>
                    <button
                      type="button"
                      disabled={busy || r.status === "HIDDEN"}
                      onClick={() => setStatus(r.id, "HIDDEN")}
                      className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Скрыть
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(r.id)}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-500 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
