import Link from "next/link";
import { ArrowRight } from "lucide-react";
import db from "@/lib/db";

// B334: landing "проверенные специалисты" now reads from db.practitioner
// instead of a hardcoded list. We select the top-4 verified ACTIVE
// practitioners ordered by rating × review-count weight, fall back to
// `FALLBACK_SPECIALISTS` only if the DB returns nothing (so the section
// is never empty on a fresh install).
//
// Gradient backgrounds are indexed by card position, not stored in DB —
// they belong to the visual layer, not the practitioner profile.

const GRADIENTS = [
  "linear-gradient(140deg, #E8C4B8, #F4D5C8)",
  "linear-gradient(140deg, #F4D9C1, #F8E6D1)",
  "linear-gradient(140deg, #DBD3EA, #E8E1F2)",
  "linear-gradient(140deg, #D6DECC, #E5EBDC)",
];

// Fallback list — exact same data shape as the DB query result. Only used
// if the DB is empty (fresh install before seed). Slugs match the
// FALLBACK_PRACTITIONERS list in src/app/practitioners/page.tsx.
const FALLBACK_SPECIALISTS = [
  { slug: "anna-kamenskaya", name: "Анна Каменская", title: "Клинический психолог", rating: 4.9, pricePerSession: 4500 },
  { slug: "liza-morozova",   name: "Лиза Морозова",   title: "Коуч идентичности",   rating: 4.8, pricePerSession: 3200 },
  { slug: "sofia-mirnaya",   name: "София Мирная",    title: "Таролог-практик",     rating: 4.7, pricePerSession: 2880 },
  { slug: "elena-orlova",    name: "Елена Орлова",    title: "Астролог",            rating: 4.6, pricePerSession: 3500 },
];

type SpecialistCard = {
  slug: string;
  name: string;
  title: string;
  rating: number;
  pricePerSession: number;
};

async function loadTopSpecialists(): Promise<SpecialistCard[]> {
  // ACTIVE + verified practitioners only — these are the ones we are
  // willing to surface as social proof on the landing.
  const rows = await db.practitioner.findMany({
    where: { status: "ACTIVE", verified: true },
    select: {
      slug: true,
      title: true,
      pricePerSession: true,
      ratingSum: true,
      reviewCount: true,
      user: { select: { name: true } },
    },
    // Best balance of "highly rated" and "actually reviewed" — featured
    // founding/verified profiles first, then high score.
    orderBy: [
      { founding: "desc" },
      { reviewCount: "desc" },
      { ratingSum: "desc" },
    ],
    take: 4,
  });

  if (rows.length === 0) return FALLBACK_SPECIALISTS;

  return rows.map((row) => ({
    slug: row.slug,
    name: row.user.name ?? "Специалист",
    title: row.title,
    rating: row.reviewCount > 0 ? Number((row.ratingSum / row.reviewCount).toFixed(1)) : 0,
    pricePerSession: row.pricePerSession,
  }));
}

export async function SpecialistsTeaserSection() {
  const specialists = await loadTopSpecialists();

  return (
    <section className="soft-shell py-16 md:py-24" data-testid="v42-specialists-teaser">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:mb-10 md:flex-row md:items-end">
        <div>
          <p className="soft-eyebrow">проверенные специалисты</p>
          <h2 className="soft-h1 mt-3">
            Когда хочется <span className="soft-italic">живой разговор</span>
          </h2>
        </div>
        <Link
          href="/practitioners"
          className="soft-button soft-button-ghost"
          data-testid="v42-specialists-all"
        >
          Все специалисты
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {specialists.map((specialist, index) => (
          <Link
            key={specialist.slug}
            href={`/practitioners/${specialist.slug}`}
            className="soft-card overflow-hidden p-0 text-left transition-transform hover:-translate-y-1 hover:shadow-[var(--soft-shadow-md)]"
          >
            <div
              className="h-20"
              style={{ background: GRADIENTS[index % GRADIENTS.length] }}
              aria-hidden="true"
            />
            <div className="p-4 pb-5">
              <div className="text-sm font-semibold text-[var(--soft-ink)]">{specialist.name}</div>
              <div className="mt-1 text-xs text-[var(--soft-ink-faint)]">{specialist.title}</div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--soft-bordeaux)]">
                  {specialist.rating > 0 ? `★ ${specialist.rating.toFixed(1)}` : "новый"}
                </span>
                <span className="text-[var(--soft-ink-faint)]">
                  от {specialist.pricePerSession.toLocaleString("ru-RU")} ₽
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
