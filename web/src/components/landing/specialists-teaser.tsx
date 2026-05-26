import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Top-4 teaser specialists shown on the landing. Slugs match the
// FALLBACK_PRACTITIONERS list in src/app/practitioners/page.tsx, so
// every card resolves to a real profile page.
const specialists = [
  {
    slug: "anna-kamenskaya",
    name: "Анна Каменская",
    role: "Клинический психолог",
    rating: "★ 4.9",
    price: "от 4 500 ₽",
    background: "linear-gradient(140deg, #E8C4B8, #F4D5C8)",
  },
  {
    slug: "liza-morozova",
    name: "Лиза Морозова",
    role: "Коуч идентичности",
    rating: "★ 4.8",
    price: "от 3 200 ₽",
    background: "linear-gradient(140deg, #F4D9C1, #F8E6D1)",
  },
  {
    slug: "sofia-mirnaya",
    name: "София Мирная",
    role: "Таролог-практик",
    rating: "★ 4.7",
    price: "от 2 880 ₽",
    background: "linear-gradient(140deg, #DBD3EA, #E8E1F2)",
  },
  {
    slug: "elena-orlova",
    name: "Елена Орлова",
    role: "Астролог",
    rating: "★ 4.6",
    price: "от 3 500 ₽",
    background: "linear-gradient(140deg, #D6DECC, #E5EBDC)",
  },
];

export function SpecialistsTeaserSection() {
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
        {specialists.map((specialist) => (
          <Link
            key={specialist.slug}
            href={`/practitioners/${specialist.slug}`}
            className="soft-card overflow-hidden p-0 text-left transition-transform hover:-translate-y-1 hover:shadow-[var(--soft-shadow-md)]"
          >
            <div className="h-20" style={{ background: specialist.background }} aria-hidden="true" />
            <div className="p-4 pb-5">
              <div className="text-sm font-semibold text-[var(--soft-ink)]">{specialist.name}</div>
              <div className="mt-1 text-xs text-[var(--soft-ink-faint)]">{specialist.role}</div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--soft-bordeaux)]">{specialist.rating}</span>
                <span className="text-[var(--soft-ink-faint)]">{specialist.price}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
