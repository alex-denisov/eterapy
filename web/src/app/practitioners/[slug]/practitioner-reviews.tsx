"use client";

import { useMemo, useState } from "react";

export interface PractitionerReviewItem {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  authorName: string | null;
}

type SortKey = "fresh" | "old" | "rating";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "fresh", label: "Свежие" },
  { key: "old", label: "Старые" },
  { key: "rating", label: "По оценке" },
];

const PAGE = 5;

/**
 * Интерфейс 7: reviews list with date/rating sorting and "показать ещё"
 * pagination. The header counter shows the real total (reviewCount) while the
 * body reveals PAGE reviews at a time, so the count and the visible list stay
 * consistent instead of "15" over 5 cards.
 */
export function PractitionerReviews({
  reviews,
  total,
}: {
  reviews: PractitionerReviewItem[];
  total: number;
}) {
  const [sort, setSort] = useState<SortKey>("fresh");
  const [shown, setShown] = useState(PAGE);

  const sorted = useMemo(() => {
    const copy = [...reviews];
    copy.sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return sort === "fresh" ? bt - at : at - bt;
    });
    return copy;
  }, [reviews, sort]);

  const visible = sorted.slice(0, shown);
  const hasMore = shown < sorted.length;

  return (
    <div className="soft-card mt-4 p-5" data-testid="practitioner-reviews">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="soft-eyebrow">отзывы ({total})</p>
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setSort(s.key);
                setShown(PAGE);
              }}
              aria-pressed={sort === s.key}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                sort === s.key
                  ? "border-[var(--soft-bordeaux)] bg-[var(--soft-apricot)] text-[var(--soft-bordeaux)] font-medium"
                  : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-bordeaux)]/40"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {visible.map((review, i) => {
          const initial = review.authorName?.[0]?.toUpperCase() ?? "?";
          return (
            <div
              key={review.id}
              style={{
                paddingTop: i > 0 ? 16 : 0,
                borderTop: i > 0 ? "1px solid var(--soft-paper-edge)" : "none",
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--soft-rose)",
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "var(--font-heading, serif)",
                    color: "var(--soft-bordeaux)",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  {initial}
                </div>
                <span style={{ color: "var(--soft-bordeaux)", fontWeight: 600, fontSize: 13 }}>
                  ★ {review.rating.toFixed(1)}
                </span>
                <span className="text-xs text-[var(--soft-ink-faint)]">
                  · {new Date(review.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </span>
              </div>
              {review.text && (
                <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">«{review.text}»</p>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="soft-button soft-button-ghost mt-4 w-full justify-center text-sm"
        >
          Показать ещё
        </button>
      )}
    </div>
  );
}
