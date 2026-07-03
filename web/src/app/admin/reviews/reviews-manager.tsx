"use client";

import { useMemo, useState } from "react";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";

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

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  PUBLISHED: { label: "Опубликован", tone: "ok" },
  REVIEW: { label: "На проверке", tone: "warn" },
  HIDDEN: { label: "Скрыт", tone: "neutral" },
};

const STATUS_OPTIONS = [
  { value: "REVIEW", label: "На проверке" },
  { value: "PUBLISHED", label: "Опубликованные" },
  { value: "HIDDEN", label: "Скрытые" },
];

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((rating) => ({
  value: String(rating),
  label: `${rating}`,
}));

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const practitioners = useMemo(() => {
    const map = new Map<string, string>();
    for (const review of reviews) {
      if (review.practitionerSlug) map.set(review.practitionerSlug, review.practitionerName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [reviews]);

  const columns = useMemo<AdminCompactColumn[]>(() => [
    { key: "rating", label: "Оценка", sortable: true, filterKind: "select", options: RATING_OPTIONS },
    { key: "text", label: "Отзыв", sortable: true },
    { key: "author", label: "Автор", sortable: true },
    {
      key: "practitioner",
      label: "Практик",
      sortable: true,
      filterKind: "select",
      options: practitioners.map(([slug, name]) => ({ value: slug, label: name })),
    },
    { key: "createdAt", label: "Дата", sortable: true, filterKind: "date" },
    {
      key: "status",
      label: "Статус",
      sortable: true,
      filterKind: "select",
      options: STATUS_OPTIONS,
    },
    { key: "actions", label: "Действия", filterKind: "none", align: "center" },
  ], [practitioners]);

  async function setStatus(id: string, status: string) {
    const previous = reviews;
    setBusyId(id);
    setReviews((rows) => rows.map((review) => (review.id === id ? { ...review, status } : review)));
    try {
      const response = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success(`Статус обновлён: ${STATUS_META[status]?.label ?? status}`);
    } catch {
      setReviews(previous);
      toast.error("Не удалось обновить статус");
    } finally {
      setBusyId(null);
    }
  }

  async function saveText(id: string) {
    const previous = reviews;
    const next = editText.trim();
    setBusyId(id);
    setReviews((rows) => rows.map((review) => (review.id === id ? { ...review, text: next || null } : review)));
    setEditingId(null);
    try {
      const response = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success("Текст отзыва обновлён");
    } catch {
      setReviews(previous);
      toast.error("Не удалось сохранить текст");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    const previous = reviews;
    setBusyId(id);
    setReviews((rows) => rows.filter((review) => review.id !== id));
    try {
      const response = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success("Отзыв удалён");
    } catch {
      setReviews(previous);
      toast.error("Не удалось удалить отзыв");
    } finally {
      setBusyId(null);
    }
  }

  const actionClass = "soft-admin-icon-button disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div data-testid="admin-reviews-manager">
      <AdminCompactDataTable
        columns={columns}
        rows={reviews.map((review) => {
          const meta = STATUS_META[review.status] ?? STATUS_META.HIDDEN;
          const busy = busyId === review.id;
          const editing = editingId === review.id;
          return {
            id: review.id,
            cells: {
              rating: {
                kind: "node",
                filterValue: String(review.rating),
                sortValue: review.rating,
                node: (
                  <span className="whitespace-nowrap text-amber-500" aria-label={`${review.rating} из 5`}>
                    {"★".repeat(review.rating)}<span className="text-muted-foreground">{"★".repeat(5 - review.rating)}</span>
                    {review.riskScore >= 50 ? <span className="ml-1 text-xs font-medium text-red-500">риск {review.riskScore}</span> : null}
                  </span>
                ),
              },
              text: {
                kind: "node",
                filterValue: `${review.text ?? ""} ${review.riskFlags.join(" ")}`,
                sortValue: review.text ?? "",
                node: editing ? (
                  <div className="min-w-[18rem] space-y-1.5">
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      rows={3}
                      maxLength={2000}
                      className="w-full rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-sm"
                      aria-label="Текст отзыва"
                    />
                    <div className="soft-admin-table-actions justify-start">
                      <button type="button" disabled={busy} onClick={() => saveText(review.id)} className={actionClass} data-variant="primary" title="Сохранить" aria-label="Сохранить отзыв">
                        <Save className="size-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" disabled={busy} onClick={() => setEditingId(null)} className={actionClass} title="Отмена" aria-label="Отменить редактирование">
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <span className="block max-w-[28rem]">
                    <span className="line-clamp-2 text-foreground" title={review.text ?? ""}>
                      {review.text ? review.text : <span className="italic text-muted-foreground">без текста</span>}
                    </span>
                    {review.riskFlags.length > 0 ? <span className="mt-1 block text-xs text-red-400">{review.riskFlags.join(", ")}</span> : null}
                  </span>
                ),
              },
              author: {
                value: review.authorName,
                subvalue: review.authorEmail,
                filterValue: `${review.authorName} ${review.authorEmail}`,
                sortValue: review.authorName,
              },
              practitioner: {
                value: review.practitionerName,
                filterValue: `${review.practitionerSlug} ${review.practitionerName}`,
                sortValue: review.practitionerName,
              },
              createdAt: {
                value: formatDateTime(review.createdAt),
                sortValue: new Date(review.createdAt).getTime(),
                filterValue: formatDateTime(review.createdAt),
              },
              status: {
                kind: "status",
                label: meta.label,
                tone: meta.tone,
                filterValue: review.status,
                sortValue: meta.label,
              },
              actions: {
                kind: "actions",
                actions: [
                  { label: "Опубликовать", icon: "check", variant: "primary", disabled: busy || review.status === "PUBLISHED", onClick: () => { void setStatus(review.id, "PUBLISHED"); } },
                  { label: "Скрыть", icon: "cancel", disabled: busy || review.status === "HIDDEN", onClick: () => { void setStatus(review.id, "HIDDEN"); } },
                  { label: "Изменить", icon: "edit", disabled: busy, onClick: () => { setEditingId(review.id); setEditText(review.text ?? ""); } },
                  ...(canDelete ? [{ label: "Удалить", icon: "delete" as const, variant: "danger" as const, disabled: busy, onClick: () => { void remove(review.id); } }] : []),
                ],
              },
            },
          };
        })}
        empty="Нет отзывов в этой категории"
        minWidth="1180px"
      />
    </div>
  );
}
