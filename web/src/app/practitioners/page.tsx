export const dynamic = "force-dynamic";

import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { PractitionersGrid } from "./practitioners-grid";

const FALLBACK_PRACTITIONERS = [
  {
    id: "fallback-anna",
    slug: "anna-kamenskaya",
    name: "Анна Каменская",
    title: "Клинический психолог",
    bio: "Помогаю замечать момент, когда вы уменьшаете себя в отношениях, и бережно возвращаться к своему голосу.",
    specialties: ["границы", "созависимость", "тревога"],
    pricePerSession: 4500,
    minDuration: 50,
    verified: true,
    rating: 4.9,
    reviewCount: 184,
    sessionCount: 420,
  },
  {
    id: "fallback-liza",
    slug: "liza-morozova",
    name: "Лиза Морозова",
    title: "Коуч по идентичности",
    bio: "Работаю с теми, кто стоит на пороге большого профессионального шага и боится потерять себя.",
    specialties: ["карьера", "выгорание", "переход"],
    pricePerSession: 3200,
    minDuration: 50,
    verified: true,
    rating: 4.8,
    reviewCount: 96,
    sessionCount: 210,
  },
  {
    id: "fallback-marina",
    slug: "marina-delvig",
    name: "Марина Дельвиг",
    title: "Семейный психолог",
    bio: "Помогаю парам говорить о трудном без обвинений и находить понятный следующий шаг.",
    specialties: ["пары", "развод", "родители"],
    pricePerSession: 5000,
    minDuration: 80,
    verified: true,
    rating: 5,
    reviewCount: 211,
    sessionCount: 380,
  },
  {
    id: "fallback-irina",
    slug: "irina-solovieva",
    name: "Ирина Соловьёва",
    title: "Юрист по семейному праву",
    bio: "Объясняю простыми словами, что юридически возможно, где риски и какие документы нужны.",
    specialties: ["развод", "опека", "договоры"],
    pricePerSession: 6000,
    minDuration: 50,
    verified: true,
    rating: 4.9,
    reviewCount: 47,
    sessionCount: 120,
  },
  {
    id: "fallback-katya",
    slug: "katya-lozovaya",
    name: "Катя Лозовая",
    title: "Психолог · детско-родительские отношения",
    bio: "Работаю с тем, как детские сценарии возвращаются во взрослые отношения и выборы.",
    specialties: ["мама", "детство", "сепарация"],
    pricePerSession: 4000,
    minDuration: 50,
    verified: true,
    rating: 4.9,
    reviewCount: 142,
    sessionCount: 260,
  },
  {
    id: "fallback-taya",
    slug: "taya-berg",
    name: "Тая Берг",
    title: "Финансовый коуч",
    bio: "Помогаю переводить тревогу о деньгах в спокойный план и ясные договорённости.",
    specialties: ["деньги", "план", "пара"],
    pricePerSession: 3500,
    minDuration: 50,
    verified: true,
    rating: 4.7,
    reviewCount: 58,
    sessionCount: 90,
  },
  {
    id: "fallback-sofia",
    slug: "sofia-mirnaya",
    name: "София Мирная",
    title: "Таро-практик · метафорические расклады",
    bio: "Использую символы как язык вопросов, а не как предсказание будущего.",
    specialties: ["TAROT", "отношения", "выбор"],
    pricePerSession: 3000,
    minDuration: 50,
    verified: true,
    rating: 4.8,
    reviewCount: 74,
    sessionCount: 160,
  },
  {
    id: "fallback-elena",
    slug: "elena-orlova",
    name: "Елена Орлова",
    title: "Астролог · психологический разбор карты",
    bio: "Помогаю смотреть на натальную карту как на карту склонностей и вопросов для себя.",
    specialties: ["ASTROLOGY", "самоопределение", "переход"],
    pricePerSession: 4200,
    minDuration: 80,
    verified: true,
    rating: 4.9,
    reviewCount: 63,
    sessionCount: 130,
  },
  {
    id: "fallback-nika",
    slug: "nika-sokol",
    name: "Ника Сокол",
    title: "Нумеролог · коуч по личным циклам",
    bio: "Бережно перевожу числовые модели в вопросы о выборе, ритме и ответственности.",
    specialties: ["NUMEROLOGY", "ритм", "цели"],
    pricePerSession: 2800,
    minDuration: 50,
    verified: true,
    rating: 4.7,
    reviewCount: 52,
    sessionCount: 118,
  },
];

async function getPractitioners() {
  const practitioners = await db.practitioner.findMany({
    where: { status: PractitionerStatus.ACTIVE },
    include: {
      user: { select: { name: true } },
      priceRates: { where: { enabled: true }, orderBy: { priceRub: "asc" }, take: 1 },
    },
    orderBy: { reviewCount: "desc" },
  }).catch(() => []);

  const mapped = practitioners.map((p) => {
    const minRate = p.priceRates[0];
    return {
      id: p.id,
      slug: p.slug,
      name: p.user.name,
      title: p.title,
      bio: p.bio,
      specialties: p.specialties as string[],
      pricePerSession: minRate?.priceRub ?? p.pricePerSession,
      minDuration: minRate?.durationMin ?? 50,
      verified: p.verified,
      rating: p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0,
      reviewCount: p.reviewCount,
      sessionCount: p.sessionCount,
    };
  });

  if (mapped.length === 0) return FALLBACK_PRACTITIONERS;

  const realSlugs = new Set(mapped.map((item) => item.slug));
  const missingReferenceProfiles = FALLBACK_PRACTITIONERS.filter((item) => !realSlugs.has(item.slug));
  return [...mapped, ...missingReferenceProfiles];
}

export const metadata = createPublicPageMetadata("/practitioners");

export default async function PractitionersPage() {
  const practitioners = await getPractitioners();

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="practitioners-page">
      <PublicJsonLd route="/practitioners" />

      {/* Hero */}
      <section className="soft-shell" style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div style={{ maxWidth: 640 }}>
            <p className="soft-eyebrow">проверенные специалисты</p>
            <h1 className="soft-h1 mt-3">
              Только те, кому <span className="soft-italic">мы доверяем сами</span>
            </h1>
            <p className="soft-lede mt-3">
              Каждый специалист проходит проверку диплома, опыта и подписывает этический кодекс.
              Цена видна до записи. Жалоба — в один клик.
            </p>
          </div>

          <div className="soft-card-flat p-5" style={{ maxWidth: 320 }}>
            <p className="soft-eyebrow mb-3">дополнительные форматы</p>
            <div className="flex flex-wrap gap-2">
              {["Таро", "Астрология", "Нумерология", "Совместные сессии", "Обучение"].map((label) => (
                <span key={label} className="soft-chip soft-chip-warm" style={{ fontSize: 12, padding: "5px 10px" }}>
                  {label}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--soft-ink-faint)]">
              Каталог расширяется постепенно: проверка, этический кодекс и цена до записи обязательны для всех форматов.
            </p>
          </div>
        </div>
      </section>

      {/* Grid with filters */}
      <section className="soft-shell py-8">
        <PractitionersGrid practitioners={practitioners} />
      </section>
    </main>
  );
}
