"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, ArrowRight } from "lucide-react";
import { SPECIALTY_LABELS as CANONICAL_SPECIALTY_LABELS } from "@/lib/types";
import { CATEGORIES, effectiveCategories, directionLabel } from "@/lib/practitioner-taxonomy";

// Map of deep-link `?format=` query values to the W3 level-1 category id used by
// CATEGORY_FILTERS. Keeps the practitioner CTA on product pages
// connected to the filtered grid view. Esoteric sub-types collapse into the
// single "esoteric" specialization (their granularity now lives in directions).
const FORMAT_TO_CATEGORY: Record<string, string> = {
  psychology: "psychology",
  psy: "psychology",
  coaching: "coaching",
  coach: "coaching",
  legal: "legal",
  finance: "finance",
  tarot: "esoteric",
  astrology: "esoteric",
  astro: "esoteric",
  numerology: "esoteric",
  numero: "esoteric",
  esoteric: "esoteric",
};

const AVATAR_GRADIENTS = [
  "linear-gradient(140deg, #E8C4B8, #F4D5C8)",
  "linear-gradient(140deg, #F4D9C1, #F8E6D1)",
  "linear-gradient(140deg, #DBD3EA, #E8E1F2)",
  "linear-gradient(140deg, #D6DECC, #E5EBDC)",
  "linear-gradient(140deg, #F4D9C1, #E8C4B8)",
  "linear-gradient(140deg, #DBD3EA, #F4D5C8)",
];

// W3: the public filters are the canonical specializations (level 1).
// M26/B367: «Совместные сессии» (joint) убраны из публичного фильтра — услуга
// joint-session закрыта; универсалов подсвечивает бейдж «психология + эзотерика».
const CATEGORY_FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "Все специалисты" },
  ...CATEGORIES.filter((c) => c.id !== "joint").map((c) => ({ id: c.id, label: c.label })),
];

// V8: the six enum categories use the canonical labels (lib/types) so cards
// match the practitioner profile editor and the admin modal; the extra
// free-text psychology labels below stay for legacy/seed specialties.
const SPECIALTY_LABELS: Record<string, string> = {
  ...CANONICAL_SPECIALTY_LABELS,
  RELATIONSHIPS: "Отношения",
  SELF_ESTEEM: "Самооценка",
  ANXIETY: "Тревога",
  CAREER: "Карьера",
  FAMILY: "Семья",
  FINANCE: "Финансы",
};

type Practitioner = {
  id: string;
  slug: string;
  name: string | null;
  title: string | null;
  bio: string | null;
  categories?: string[];
  directions?: string[];
  specialties: string[];
  pricePerSession: number;
  minDuration: number;
  verified: boolean;
  rating: number;
  reviewCount: number;
  sessionCount: number;
};

function normalizeSpecialty(s: string) {
  return SPECIALTY_LABELS[s] ?? s.toLocaleLowerCase("ru-RU");
}

/** Chips shown on a card: prefer the W3 directions, fall back to legacy specialties. */
function cardChips(p: Practitioner): string[] {
  if (p.directions && p.directions.length > 0) return p.directions.map(directionLabel);
  return p.specialties.map(normalizeSpecialty);
}

export function PractitionersGrid({ practitioners }: { practitioners: Practitioner[] }) {
  const searchParams = useSearchParams();
  const formatParam = searchParams.get("format");
  const initialCat = (formatParam && FORMAT_TO_CATEGORY[formatParam]) || "all";
  const [cat, setCat] = useState(initialCat);
  const [sort, setSort] = useState("rec");

  // Keep the chip in sync if the user navigates between practitioner CTAs
  // with different `?format=` query values without a full page reload.
  useEffect(() => {
    if (formatParam) {
      const mapped = FORMAT_TO_CATEGORY[formatParam];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (mapped && mapped !== cat) setCat(mapped);
    }
    // We intentionally re-evaluate when the URL search param changes.
  }, [formatParam, cat]);

  const withCat = practitioners.map((p, i) => {
    const rawCats = effectiveCategories({ categories: p.categories, specialties: p.specialties, title: p.title }) as string[];
    // M26/B367: legacy "joint" category practitioners are psychology+esoteric
    // universals; the closed joint-session service is replaced by a badge.
    const cats = rawCats.includes("joint")
      ? [...new Set([...rawCats.filter((c) => c !== "joint"), "psychology", "esoteric"])]
      : rawCats;
    return {
      ...p,
      cats,
      universal: cats.includes("psychology") && cats.includes("esoteric"),
      gradIdx: i % AVATAR_GRADIENTS.length,
    };
  });

  const filtered = cat === "all" ? withCat : withCat.filter((p) => p.cats.includes(cat));
  const sorted = [...filtered].sort((a, b) =>
    sort === "price" ? a.pricePerSession - b.pricePerSession :
    sort === "rating" ? b.rating - a.rating : 0,
  );

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

      {sorted.length === 0 ? (
        <div className="soft-card p-8 text-center" data-testid="specialists-empty-state">
          <p className="soft-eyebrow">нет открытых слотов</p>
          <h2 className="soft-h3 mt-2">В этом направлении пока нет открытых слотов</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Каталог расширяется постепенно: каждый специалист проходит проверку,
            подписывает этический кодекс и показывает цену до записи.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" className="soft-button soft-button-ghost" onClick={() => setCat("all")}>
              Показать всех
            </button>
            <Link href="/checkin" className="soft-button soft-button-primary inline-flex">
              Начать с диалога
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 lg:grid-cols-3" data-testid="specialists-v4-list">
          {sorted.map((p) => {
          const initial = (p.name ?? "?")[0].toUpperCase();
          const gradient = AVATAR_GRADIENTS[p.gradIdx];
          const displayRating = p.reviewCount > 0 ? (p.rating).toFixed(1) : null;
          const displayName = p.name ?? "Специалист";

            return (
            <article
              key={p.id}
              className="soft-card cursor-pointer overflow-hidden"
              style={{ padding: 0, display: "flex", flexDirection: "column" }}
              onClick={() => { window.location.href = `/practitioners/${p.slug}`; }}
              data-testid={`practitioner-card-${p.slug}`}
            >
              {/* Gradient header */}
              <div style={{ height: 120, background: gradient, position: "relative", flexShrink: 0 }}>
                {(p.verified || p.universal) && (
                  <div style={{ position: "absolute", top: 14, left: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {p.verified && (
                      <span
                        className="inline-flex items-center gap-1"
                        style={{ background: "rgba(255,255,255,.72)", color: "var(--soft-bordeaux)", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}
                      >
                        <BadgeCheck className="size-3" aria-hidden="true" />
                        Проверен
                      </span>
                    )}
                    {p.universal && (
                      <span
                        data-testid="practitioner-universal-badge"
                        style={{ background: "rgba(255,255,255,.72)", color: "#4A3E5E", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}
                      >
                        психология + эзотерика
                      </span>
                    )}
                  </div>
                )}
                {/* Circle avatar overlapping header bottom */}
                <div
                  style={{
                    position: "absolute", left: 24, bottom: -36,
                    width: 80, height: 80, borderRadius: "50%",
                    background: "var(--soft-paper-card)",
                    display: "grid", placeItems: "center",
                    fontFamily: "var(--font-heading, serif)", fontSize: 36, fontWeight: 500,
                    color: "var(--soft-bordeaux)",
                    boxShadow: "0 4px 14px rgba(60,30,20,.15), inset 0 0 0 4px var(--soft-paper-card)",
                  }}
                  aria-hidden="true"
                >
                  {initial}
                </div>
              </div>

              {/* Card body — padding-top compensates for the overlapping avatar */}
              <div style={{ padding: "44px 22px 22px", flex: 1, display: "flex", flexDirection: "column" }}>
                <p
                  style={{ fontSize: 22, fontFamily: "var(--font-heading, serif)", color: "var(--soft-bordeaux)", fontWeight: 500, lineHeight: 1.2 }}
                >
                  {displayName}
                </p>
                <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{p.title}</p>
                {p.bio && (
                  <p
                    className="mt-3 flex-1 text-sm italic leading-snug text-[var(--soft-ink-soft)]"
                    style={{ fontFamily: "var(--font-heading, serif)", lineHeight: 1.4 }}
                  >
                    «{p.bio}»
                  </p>
                )}
                {cardChips(p).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {cardChips(p).slice(0, 3).map((s) => (
                      <span key={s} className="soft-chip soft-chip-warm px-2 py-1 text-[11.5px]">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <hr style={{ margin: "16px 0 14px", borderColor: "var(--soft-paper-edge)", borderTopWidth: 1, borderStyle: "solid" }} />

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[11px] text-[var(--soft-ink-faint)]">{p.minDuration} мин · от</p>
                    <p
                      style={{ fontSize: 20, fontFamily: "var(--font-heading, serif)", color: "var(--soft-bordeaux)", fontWeight: 600 }}
                    >
                      {p.pricePerSession.toLocaleString("ru")} ₽
                    </p>
                  </div>
                  {displayRating && (
                    <span className="text-xs font-semibold text-[var(--soft-bordeaux)]">★ {displayRating} · {p.reviewCount}</span>
                  )}
                </div>

                <Link
                  href={`/practitioners/${p.slug}`}
                  className="soft-button soft-button-primary mt-3 w-full justify-center text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  Записаться
                </Link>
              </div>
            </article>
            );
          })}
        </div>
      )}

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
