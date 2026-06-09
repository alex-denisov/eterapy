export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { SPECIALTY_LABELS } from "@/lib/types";
import { effectiveCategories, categoryLabel, directionLabel } from "@/lib/practitioner-taxonomy";
import { SlotPicker } from "./slot-picker";
import { PractitionerReviews } from "./practitioner-reviews";
import { APP_URL } from "@/lib/env";

const BASE_URL = APP_URL;

const AVATAR_GRADIENTS = [
  "linear-gradient(140deg, #E8C4B8, #F4D5C8)",
  "linear-gradient(140deg, #F4D9C1, #F8E6D1)",
  "linear-gradient(140deg, #DBD3EA, #E8E1F2)",
  "linear-gradient(140deg, #D6DECC, #E5EBDC)",
];

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const p = await db.practitioner.findFirst({
    where: { slug, status: PractitionerStatus.ACTIVE },
    include: { user: { select: { name: true, avatarUrl: true } } },
  }).catch(() => null);
  if (!p) return { title: "Практик — ETerapy" };

  const avgRating = p.reviewCount > 0 ? (p.ratingSum / p.reviewCount).toFixed(1) : null;
  const description = `${p.title}. ${avgRating ? `Рейтинг ${avgRating}/5.` : ""} ${p.bio.slice(0, 120)}...`;

  return {
    title: `${p.user.name} — ${p.title} | ETerapy`,
    description,
    openGraph: {
      title: `${p.user.name} — ${p.title}`,
      description,
      url: `${BASE_URL}/practitioners/${slug}`,
      type: "profile",
      ...(p.user.avatarUrl ? { images: [{ url: p.user.avatarUrl, width: 400, height: 400, alt: p.user.name }] } : {}),
    },
    twitter: {
      card: "summary",
      title: `${p.user.name} — ${p.title}`,
      description,
      ...(p.user.avatarUrl ? { images: [p.user.avatarUrl] } : {}),
    },
    alternates: { canonical: `${BASE_URL}/practitioners/${slug}` },
  };
}

async function getPractitioner(slug: string) {
  return db.practitioner.findFirst({
    where: { slug, status: PractitionerStatus.ACTIVE },
    include: {
      user: { select: { name: true } },
      priceRates: { where: { enabled: true }, orderBy: { priceRub: "asc" } },
      reviews: {
        where: { status: "PUBLISHED" },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  }).catch(() => null);
}

export default async function PractitionerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ precheck?: string; source?: string; dialogueId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const p = await getPractitioner(slug);
  // B346/Интерфейс 8-9: no more demo "v4" fallback cards — every practitioner
  // page is backed by a real DB row, so an unknown slug is a genuine 404.
  if (!p) notFound();

  const rating = p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0;
  const firstRate = p.priceRates[0];
  const initial = p.user.name.charAt(0).toUpperCase();
  // Derive gradient from name length for variety
  const gradientIdx = p.user.name.length % AVATAR_GRADIENTS.length;
  const avatarGradient = AVATAR_GRADIENTS[gradientIdx];
  // W3: three-level taxonomy — specialization badges, direction chips, task chips.
  const categoryNames = effectiveCategories({
    categories: p.categories,
    specialties: p.specialties as string[],
    title: p.title,
  }).map(categoryLabel);
  const directionNames = (p.directions ?? []).map(directionLabel);
  const rawHelpChips = directionNames.length > 0
    ? directionNames
    : (p.specialties as string[]).map((s) => SPECIALTY_LABELS[s] ?? s);
  // Интерфейс 7: drop case-insensitive duplicate chips ("Астрология" vs
  // "астрология") within help chips, and hide tags already shown as help chips
  // or as category badges in the header.
  const seenChips = new Set<string>();
  const helpChips = rawHelpChips.filter((c) => {
    const k = c.trim().toLowerCase();
    if (!k || seenChips.has(k)) return false;
    seenChips.add(k);
    return true;
  });
  const badgeKeys = new Set(categoryNames.map((c) => c.trim().toLowerCase()));
  const dedupedTags = p.tags.filter((tag) => {
    const k = tag.trim().toLowerCase();
    if (!k || seenChips.has(k) || badgeKeys.has(k)) return false;
    seenChips.add(k);
    return true;
  });
  const displayRating = rating > 0 ? rating.toFixed(1) : null;
  const priceDisplay = (firstRate?.priceRub ?? p.pricePerSession).toLocaleString("ru");
  const cameFromPrecheck = query?.source === "practitioner_precheck" || Boolean(query?.precheck);
  const cameFromRecommendation = Boolean(query?.dialogueId);

  return (
    <main className="soft-clarity-page soft-public-page">
      <section className="soft-shell py-10 md:py-14">
        {/* v4: chip back button */}
        <Link href="/practitioners" className="soft-chip mb-6 inline-flex">
          ← Все специалисты
        </Link>

        {/* v4: 2-col grid 1.4fr / 1fr */}
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-start">

          {/* ── Left column ── */}
          <div>
            {/* v4 profile header: flex row with large circle avatar + info */}
            <div className="mb-6 flex items-start gap-4">
              <div
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: "50%",
                  background: avatarGradient,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "var(--font-heading, serif)",
                  fontSize: 44,
                  color: "var(--soft-bordeaux)",
                  fontWeight: 500,
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                {initial}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {p.verified
                    ? <span className="soft-badge">Проверен ETerapy</span>
                    : <span className="soft-badge" style={{ background: "var(--soft-apricot)", color: "var(--soft-bordeaux)" }} title="Профиль ещё не прошёл проверку ETerapy">Не верифицирован</span>}
                  {p.founding && <span className="soft-badge soft-badge-lilac">Основатель</span>}
                  {p.experience && <span className="soft-badge">{p.experience}</span>}
                  {categoryNames.map((c) => (
                    <span key={c} className="soft-badge soft-badge-lilac">{c}</span>
                  ))}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-heading, serif)",
                    fontSize: 36,
                    color: "var(--soft-bordeaux)",
                    fontWeight: 500,
                    lineHeight: 1.2,
                  }}
                >
                  {p.user.name}
                </div>
                <div className="mt-1 text-sm text-[var(--soft-ink-soft)]">
                  {p.title} · работает онлайн
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {displayRating && (
                    <>
                      <span style={{ color: "var(--soft-bordeaux)", fontWeight: 600 }}>★ {displayRating}</span>
                      <span className="text-[var(--soft-ink-faint)]">{p.reviewCount} отзывов</span>
                      <span className="text-[var(--soft-ink-faint)]">·</span>
                    </>
                  )}
                  <span className="text-[var(--soft-ink-faint)]">от {priceDisplay} ₽ / {firstRate?.durationMin ?? 50} мин</span>
                </div>
              </div>
            </div>

            {/* v4: "обо мне" card with serif italic bio */}
            <div className="soft-card p-5">
              <p className="soft-eyebrow">обо мне</p>
              <p
                className="mt-3"
                style={{
                  fontFamily: "var(--font-heading, serif)",
                  fontStyle: "italic",
                  fontSize: 19,
                  color: "var(--soft-bordeaux)",
                  lineHeight: 1.45,
                }}
              >
                «{p.bio}»
              </p>
            </div>

            {/* Интерфейс 7: "образование и опыт" сразу после "обо мне" */}
            <div className="soft-card-flat mt-4 p-5">
              <p className="soft-eyebrow">образование и опыт</p>
              <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--soft-ink-soft)]">
                {p.experience && <div>Опыт: {p.experience}</div>}
                {p.languages && p.languages.length > 0 && (
                  <div>Языки: {p.languages.join(", ")}</div>
                )}
                <div>Верификация пройдена ETerapy</div>
              </div>
            </div>

            {/* v4 + W3: "с чем помогаю" — направления (warm) + задачи (plain) */}
            {(helpChips.length > 0 || dedupedTags.length > 0) && (
              <div className="soft-card mt-4 p-5">
                <p className="soft-eyebrow mb-3">с чем помогаю</p>
                <div className="flex flex-wrap gap-2">
                  {helpChips.map((s) => (
                    <span key={s} className="soft-chip soft-chip-warm">{s}</span>
                  ))}
                  {dedupedTags.map((tag) => (
                    <span key={tag} className="soft-chip">{tag}</span>
                  ))}
                </div>
                {p.languages && p.languages.length > 0 && (
                  <>
                    <hr style={{ margin: "16px 0 12px", borderColor: "var(--soft-paper-edge)" }} />
                    <p className="soft-eyebrow mb-2">языки</p>
                    <p className="text-sm text-[var(--soft-ink-soft)]">{p.languages.join(", ")}</p>
                  </>
                )}
              </div>
            )}

            {/* v4: "услуги" pricing rows card */}
            {p.priceRates.length > 0 && (
              <div className="soft-card mt-4 p-5">
                <p className="soft-eyebrow mb-3">услуги</p>
                <div className="flex flex-col gap-3">
                  {p.priceRates.map((rate) => (
                    <div
                      key={rate.id}
                      className="flex items-center justify-between"
                      style={{ padding: "12px 16px", background: "var(--soft-paper-deep)", borderRadius: 12 }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>Индивидуальная сессия</div>
                        <div className="text-xs text-[var(--soft-ink-faint)] mt-0.5">{rate.durationMin} мин · онлайн</div>
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-heading, serif)",
                          color: "var(--soft-bordeaux)",
                          fontWeight: 600,
                          fontSize: 17,
                        }}
                      >
                        {rate.priceRub.toLocaleString("ru")} ₽
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Интерфейс 7: reviews with date/rating sort + "показать ещё" */}
            {p.reviews.length > 0 && (
              <PractitionerReviews
                total={p.reviewCount}
                reviews={p.reviews.map((r) => ({
                  id: r.id,
                  rating: r.rating,
                  text: r.text,
                  createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
                  authorName: r.author.name,
                }))}
              />
            )}
          </div>

          {/* ── Right column: sticky booking sidebar ── */}
          <aside style={{ position: "sticky", top: 84 }}>
            {/* v4: booking card */}
            <div className="soft-card p-7">
              <p className="soft-eyebrow">записаться</p>
              <h3 className="soft-h3 mt-2">Индивидуальная сессия</h3>
              {cameFromRecommendation && (
                <div className="mt-3 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] p-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]" data-testid="recommendation-booking-context">
                  Специалист рекомендован по вашему запросу. Контекст будет учтён при записи.
                </div>
              )}
              {!cameFromRecommendation && cameFromPrecheck && (
                <div className="mt-3 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] p-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]" data-testid="precheck-booking-context">
                  Предразбор сохранён. Выберите время, а контекст вопроса останется связанным с этим переходом.
                </div>
              )}
              {/* B353/Интерфейс 10: длительность и цена показываются на чипах
                  «Формат сессии» внутри SlotPicker и меняются при переключении.
                  Прежний статичный подзаголовок с длительностью/ценой убран —
                  он не обновлялся при смене формата и дублировал переключатель. */}
              <div className="mt-6">
                <SlotPicker practitionerId={p.id} practitionerName={p.user.name} />
              </div>

              <div className="mt-4 text-xs text-[var(--soft-ink-faint)] text-center">
                Оплата после подтверждения слота. Можно отменить за 24 часа.
              </div>
            </div>

            {/* v4: ethics card-flat */}
            <div className="soft-card-flat mt-4 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="size-5 shrink-0 text-[var(--soft-terracotta-dark)] mt-0.5" aria-hidden="true" />
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>Этический кодекс</p>
                  <p className="mt-1 text-xs text-[var(--soft-ink-faint)] leading-relaxed">
                    Специалист подписал кодекс ETerapy: без запугивания, без обещаний результата, без оплаты вне платформы.
                  </p>
                </div>
              </div>
            </div>

            {/* v4: complaint button */}
            <Link
              href="/legal/ethics"
              className="soft-button soft-button-ghost mt-4 w-full justify-center text-sm"
              style={{ opacity: 0.65 }}
            >
              Пожаловаться на специалиста
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
