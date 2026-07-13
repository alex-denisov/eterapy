"use client";

import { useState } from "react";

// B466 R9-5 — список отзывов с постраничным показом: сначала 5, кнопка «Ещё»
// открывает по 5. Используется и мобильной (pcab), и десктопной версией.

export interface ReviewItem {
  id: string;
  authorName: string | null;
  rating: number;
  text: string | null;
  status: string;
  createdAtIso: string;
  riskScore: number;
  riskFlags: string[];
}

const PAGE = 5;

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});

function reviewInitials(name: string | null): string {
  if (!name) return "К";
  return (
    name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "К"
  );
}

export function PractitionerReviewsList({ reviews, variant }: { reviews: ReviewItem[]; variant: "pcab" | "desktop" }) {
  const [shown, setShown] = useState(PAGE);
  const visible = reviews.slice(0, shown);
  const remaining = reviews.length - shown;
  const nextChunk = Math.min(PAGE, remaining);

  if (variant === "pcab") {
    return (
      <>
        {visible.map((r) => (
          <div key={r.id} className="pcab-rev">
            <div className="pcab-rev-top">
              <span className="pcab-rev-av" aria-hidden="true">{(r.authorName ?? "К")[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pcab-rev-name">
                  {r.authorName ?? "Клиент"}
                  {r.status !== "PUBLISHED" && (
                    <span className="pcab-needchip" style={{ marginLeft: 6 }}>{r.status === "REVIEW" ? "на проверке" : "скрыт"}</span>
                  )}
                </div>
                <div className="pcab-rev-when">{DATE_FMT.format(new Date(r.createdAtIso))}</div>
              </div>
              <div className="pcab-rev-stars" aria-label={`${r.rating} из 5`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} style={{ opacity: i < r.rating ? 1 : 0.22 }}>★</span>
                ))}
              </div>
            </div>
            {r.text && <div className="pcab-rev-text">{r.text}</div>}
          </div>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            className="pcab-btn pcab-btn-ghost"
            style={{ width: "100%", marginTop: 12 }}
            onClick={() => setShown((s) => s + PAGE)}
            data-testid="practitioner-reviews-more-mobile"
          >
            Показать ещё {nextChunk}
          </button>
        )}
      </>
    );
  }

  // ── Десктоп ───────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-5">
        {visible.map((r) => (
          <div key={r.id} className="border-b border-[var(--soft-paper-deep)] pb-5 last:border-0 last:pb-0">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--soft-paper-deep)] text-[12px] font-semibold text-[var(--soft-bordeaux)]">
                {reviewInitials(r.authorName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[14px] font-medium">
                  <span className="truncate">{r.authorName ?? "Клиент"}</span>
                  {r.status !== "PUBLISHED" && (
                    <span className="shrink-0 rounded-md px-1.5 py-px text-[10px] font-semibold" style={{ background: "var(--soft-lilac-bg, #EAE4F0)", color: "var(--soft-lilac-ink, #5B4A73)" }}>
                      {r.status === "REVIEW" ? "на проверке" : "скрыт"}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">{DATE_FMT.format(new Date(r.createdAtIso))}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5" aria-label={`${r.rating} из 5`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className="text-[14px]" style={{ color: i < r.rating ? "#D8A24A" : "var(--soft-paper-deep)" }}>★</span>
                ))}
              </div>
            </div>
            {r.text && <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--soft-ink-soft)]">{r.text}</p>}
            {(r.riskScore > 0 || r.riskFlags.length > 0) && (
              <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
                Модерация: {r.riskScore}/100{r.riskFlags.length > 0 ? ` · ${r.riskFlags.slice(0, 3).join(", ")}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          className="soft-button soft-button-ghost mt-5 w-full justify-center"
          onClick={() => setShown((s) => s + PAGE)}
          data-testid="practitioner-reviews-more-desktop"
        >
          Показать ещё {nextChunk}
        </button>
      )}
    </>
  );
}
