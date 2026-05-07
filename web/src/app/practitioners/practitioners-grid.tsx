"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, ArrowRight } from "lucide-react";

const AVATAR_GRADIENTS = [
  "linear-gradient(140deg, #E8C4B8, #F4D5C8)",
  "linear-gradient(140deg, #F4D9C1, #F8E6D1)",
  "linear-gradient(140deg, #DBD3EA, #E8E1F2)",
  "linear-gradient(140deg, #D6DECC, #E5EBDC)",
  "linear-gradient(140deg, #F4D9C1, #E8C4B8)",
  "linear-gradient(140deg, #DBD3EA, #F4D5C8)",
];

const CATEGORY_FILTERS = [
  { id: "all", label: "Все направления" },
  { id: "psy", label: "Психология" },
  { id: "coach", label: "Коучинг" },
  { id: "legal", label: "Юристы" },
  { id: "finance", label: "Финансы" },
];

type Practitioner = {
  id: string;
  slug: string;
  name: string | null;
  title: string | null;
  bio: string | null;
  specialties: string[];
  pricePerSession: number;
  minDuration: number;
  verified: boolean;
  rating: number;
  reviewCount: number;
  sessionCount: number;
};

function detectCategory(p: Practitioner): string {
  const title = (p.title ?? "").toLowerCase();
  if (title.includes("психолог") || title.includes("терапевт") || title.includes("психиатр")) return "psy";
  if (title.includes("коуч")) return "coach";
  if (title.includes("юрист") || title.includes("адвокат") || title.includes("правов")) return "legal";
  if (title.includes("финанс") || title.includes("бухгалтер") || title.includes("эконом")) return "finance";
  return "psy";
}

export function PractitionersGrid({ practitioners }: { practitioners: Practitioner[] }) {
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("rec");

  const withCat = practitioners.map((p, i) => ({ ...p, cat: detectCategory(p), gradIdx: i % AVATAR_GRADIENTS.length }));

  const filtered = cat === "all" ? withCat : withCat.filter((p) => p.cat === cat);
  const sorted = [...filtered].sort((a, b) =>
    sort === "price" ? a.pricePerSession - b.pricePerSession :
    sort === "rating" ? b.rating - a.rating : 0,
  );

  if (sorted.length === 0) {
    return (
      <div className="soft-card p-8 text-center">
        <p className="text-[var(--soft-ink-soft)]">Специалисты в этом направлении появятся совсем скоро.</p>
        <Link href="/checkin" className="soft-button soft-button-primary mt-4 inline-flex">
          Начать с диалога
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Filters + sort row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c.id}
              className={["soft-chip transition-colors", cat === c.id ? "soft-chip-warm" : ""].join(" ")}
              onClick={() => setCat(c.id)}
              aria-pressed={cat === c.id}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--soft-ink-faint)]">сортировка:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="soft-chip cursor-pointer appearance-none bg-transparent px-4 py-2 text-sm"
            aria-label="Сортировка специалистов"
          >
            <option value="rec">рекомендуемые</option>
            <option value="rating">по рейтингу</option>
            <option value="price">сначала дешевле</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((p) => {
          const initial = (p.name ?? "?")[0].toUpperCase();
          const gradient = AVATAR_GRADIENTS[p.gradIdx];
          const displayRating = p.reviewCount > 0 ? (p.rating).toFixed(1) : null;
          const displayName = p.name ?? "Специалист";

          return (
            <article
              key={p.id}
              className="soft-card cursor-pointer overflow-hidden p-0 flex flex-col"
              onClick={() => { window.location.href = `/practitioners/${p.slug}`; }}
              data-testid="practitioner-card"
            >
              {/* Gradient header */}
              <div className="relative h-28" style={{ background: gradient }}>
                {p.verified && (
                  <div className="absolute left-4 top-3 flex gap-2">
                    <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(255,255,255,.7)", color: "var(--soft-bordeaux)" }}>
                      Проверен
                    </span>
                  </div>
                )}
                {/* Avatar circle */}
                <div
                  className="absolute -bottom-9 left-5 flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-md"
                  style={{
                    background: "var(--soft-paper-card)",
                    fontFamily: "var(--font-heading, serif)",
                    fontSize: 30,
                    fontWeight: 500,
                    color: "var(--soft-bordeaux)",
                    boxShadow: "0 4px 14px rgba(60,30,20,.15), inset 0 0 0 4px var(--soft-paper-card)",
                  }}
                  aria-hidden="true"
                >
                  {initial}
                </div>
              </div>

              {/* Card body */}
              <div className="flex flex-1 flex-col px-5 pb-5 pt-12">
                <p
                  className="text-xl font-semibold leading-tight"
                  style={{ fontFamily: "var(--font-heading, serif)", color: "var(--soft-bordeaux)" }}
                >
                  {displayName}
                </p>
                <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{p.title}</p>
                {p.bio && (
                  <p
                    className="mt-3 flex-1 text-sm italic leading-snug text-[var(--soft-ink-soft)] line-clamp-3"
                    style={{ fontFamily: "var(--font-heading, serif)" }}
                  >
                    «{p.bio}»
                  </p>
                )}
                {p.specialties.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.specialties.slice(0, 3).map((s) => (
                      <span key={s} className="soft-chip soft-chip-soft text-xs px-2 py-1">{s}</span>
                    ))}
                  </div>
                )}
                <hr className="my-3 border-[var(--soft-paper-edge)]" />
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] text-[var(--soft-ink-faint)]">от {p.minDuration} мин ·</p>
                    <p
                      className="text-xl font-semibold"
                      style={{ fontFamily: "var(--font-heading, serif)", color: "var(--soft-bordeaux)" }}
                    >
                      {p.pricePerSession.toLocaleString("ru")} ₽
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {displayRating && (
                      <span className="text-xs font-semibold text-[var(--soft-bordeaux)]">★ {displayRating} · {p.reviewCount}</span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/practitioners/${p.slug}`}
                  className="soft-button soft-button-primary mt-3 justify-center text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  Записаться
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div className="soft-card mt-8 p-6 text-center" style={{ background: "var(--soft-paper-deep)" }}>
        <p
          className="text-xl italic text-[var(--soft-ink-soft)]"
          style={{ fontFamily: "var(--font-heading, serif)" }}
        >
          Не уверены, к кому обратиться? Подберём специалиста под ваш разбор бесплатно.
        </p>
        <Link href="/checkin" className="soft-button soft-button-primary mt-4 inline-flex">
          Начать с разбора
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}
