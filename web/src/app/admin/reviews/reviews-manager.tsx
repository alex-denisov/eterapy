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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ReviewsManager({
  reviews: initial,
  canDelete,
}: {
  reviews: AdminReview[];
  canDelete: boolean;
}) {
  const [reviews, setReviews] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? reviews : reviews.filter((r) => r.status === filter)),
    [reviews, filter],
  );

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
      <div className="mb-4 flex flex-wrap gap-2">
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
                      {r.authorName} → практик <strong>{r.practitionerName}</strong> · {formatDate(r.createdAt)}
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
