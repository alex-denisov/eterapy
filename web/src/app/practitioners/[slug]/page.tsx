export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Zap } from "lucide-react";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { PractitionerStatus } from "@prisma/client";
import { MEETING_CONTEXT_MAX } from "@/lib/booking-context";
import { effectiveCategories, categoryLabel } from "@/lib/practitioner-taxonomy";
import { practitionerHelpChips } from "@/lib/practitioner-chips";
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
  // W3: specialization badges in the header.
  const categoryNames = effectiveCategories({
    categories: p.categories,
    specialties: p.specialties as string[],
    title: p.title,
  }).map(categoryLabel);
  // B457 (items 9+10): one tasks-first «с чем помогаю» list — no title echo, no
  // dups, consistent case + colour. Drop any chip already shown as a category badge.
  const badgeKeys = new Set(categoryNames.map((c) => c.trim().toLowerCase()));
  const helpChips = practitionerHelpChips({
    directions: p.directions,
    specialties: p.specialties as string[],
    tags: p.tags,
  }).filter((c) => !badgeKeys.has(c.trim().toLowerCase()));
  const displayRating = rating > 0 ? rating.toFixed(1) : null;
  const priceDisplay = (firstRate?.priceRub ?? p.pricePerSession).toLocaleString("ru");
  const cameFromPrecheck = query?.source === "practitioner_precheck" || Boolean(query?.precheck);
  const cameFromRecommendation = Boolean(query?.dialogueId);

  // B379: «контекст встречи». Спрашиваем при первой записи к специалисту;
  // повторная запись к тому же специалисту — без повторного запроса. Контекст
  // можно перенести из диалога, из которого пришла рекомендация (dialogueId).
  const session = await auth().catch(() => null);
  let askContext = true;
  let prefillContext = "";
  if (session?.user?.id) {
    const priorBooking = await db.booking
      .findFirst({ where: { clientId: session.user.id, practitionerId: p.id }, select: { id: true } })
      .catch(() => null);
    askContext = !priorBooking;
    if (askContext && query?.dialogueId) {
      // Переносим контекст только из диалога, принадлежащего этому пользователю
      // (защита от подстановки чужого dialogueId через URL).
      const dialogue = await db.dialogue
        .findFirst({
          where: { id: query.dialogueId, userId: session.user.id },
          select: { title: true, topic: true },
        })
        .catch(() => null);
      if (dialogue) {
        prefillContext = (dialogue.topic || dialogue.title || "").slice(0, MEETING_CONTEXT_MAX);
      }
    }
  }

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

            {/* B457: "с чем помогаю" — single tasks-first chip row (consistent
                style, no dups). Языки live only in "образование и опыт" above. */}
            {helpChips.length > 0 && (
              <div className="soft-card mt-4 p-5">
                <p className="soft-eyebrow mb-3">с чем помогаю</p>
                <div className="flex flex-wrap gap-2">
                  {helpChips.map((s) => (
                    <span key={s} className="soft-chip soft-chip-warm">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* v4: "услуги" pricing rows card — B353/Интерфейс 10 (6): tighter
                card + rows (one duration·price line each) so the block reads as a
                compact price list instead of large padded tiles. */}
            {p.priceRates.length > 0 && (
              <div className="soft-card mt-4 p-4">
                <p className="soft-eyebrow mb-2.5">услуги</p>
                <div className="flex flex-col gap-2">
                  {p.priceRates.map((rate) => (
                    <div
                      key={rate.id}
                      className="flex items-center justify-between"
                      style={{ padding: "8px 12px", background: "var(--soft-paper-deep)", borderRadius: 10 }}
                    >
                      <div className="flex items-baseline gap-2">
                        <span style={{ fontWeight: 600 }}>Индивидуальная сессия</span>
                        <span className="text-xs text-[var(--soft-ink-faint)]">{rate.durationMin} мин · онлайн</span>
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-heading, serif)",
                          color: "var(--soft-bordeaux)",
                          fontWeight: 600,
                          fontSize: 16,
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
          {/* B353/Интерфейс 10 (5): a sticky element taller than the viewport
              gets its lower part (calendar + slots + confirm) clipped and
              unreachable. Cap the height to the viewport and let the booking
              block scroll within itself so every control stays accessible. */}
          <aside
            className="self-start overflow-y-auto"
            style={{ position: "sticky", top: 84, maxHeight: "calc(100vh - 100px)" }}
          >
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
                <SlotPicker
                  practitionerId={p.id}
                  practitionerName={p.user.name}
                  askContext={askContext}
                  prefillContext={prefillContext}
                />
              </div>

              <div className="mt-4 text-xs text-[var(--soft-ink-faint)] text-center">
                Оплата после подтверждения слота. Можно отменить за 24 часа.
              </div>

              {/* B353/Интерфейс 10 (2): make priority booking visible. Premium
                  gets early access to slots + waitlist promotion when full —
                  previously a backend-only benefit with no surface here. */}
              <Link
                href={`${APP_URL}/cabinet/billing`}
                className="mt-3 flex items-center gap-2 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] px-3 py-2 text-xs leading-snug text-[var(--soft-ink-soft)] transition-colors hover:border-[var(--soft-terracotta)]"
                data-testid="priority-booking-hint"
              >
                <Zap className="size-3.5 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                <span><span style={{ fontWeight: 600 }}>Приоритетная запись</span> — ранний доступ к слотам и место в листе ожидания на Premium.</span>
              </Link>
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
