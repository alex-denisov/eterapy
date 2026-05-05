export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ShieldCheck, Star } from "lucide-react";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { SPECIALTY_LABELS } from "@/lib/types";
import { SlotPicker } from "./slot-picker";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const p = await db.practitioner.findFirst({
    where: { slug, status: PractitionerStatus.ACTIVE },
    include: { user: { select: { name: true, avatarUrl: true } } },
  });
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
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}

function StarRating({ rating }: { rating: number }) {
  const stars = Math.round(rating);
  return (
    <span className="flex items-center gap-0.5 text-sm">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`size-4 ${i <= stars ? "fill-[var(--soft-terracotta)] text-[var(--soft-terracotta)]" : "text-[var(--soft-paper-edge)]"}`} />
      ))}
      <span className="ml-1 font-semibold text-[var(--soft-bordeaux)]">{rating.toFixed(1)}</span>
    </span>
  );
}

export default async function PractitionerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPractitioner(slug);
  if (!p) notFound();

  const rating = p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0;
  const firstRate = p.priceRates[0];

  return (
    <main className="soft-clarity-page soft-public-page">
      <section className="soft-shell py-10 md:py-14">
        <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--soft-ink-faint)]">
          <Link href="/" className="hover:text-[var(--soft-bordeaux)]">Главная</Link>
          <span>/</span>
          <Link href="/practitioners" className="hover:text-[var(--soft-bordeaux)]">Специалисты</Link>
          <span>/</span>
          <span className="text-[var(--soft-bordeaux)]">{p.user.name}</span>
        </nav>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <header className="soft-card soft-form-panel">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="soft-avatar h-24 w-24 shrink-0 text-4xl">{p.user.name.charAt(0)}</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="soft-h1">{p.user.name}</h1>
                    {p.verified ? <span className="soft-badge"><BadgeCheck className="size-3.5" /> Проверен ETerapy</span> : null}
                    {p.founding ? <span className="soft-badge soft-badge-warm">Основатель</span> : null}
                  </div>
                  <p className="mt-2 text-[var(--soft-ink-soft)]">{p.title}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <StarRating rating={rating} />
                    <span className="text-sm text-[var(--soft-ink-faint)]">{p.reviewCount} отзывов</span>
                    <span className="text-sm text-[var(--soft-ink-faint)]">{p.sessionCount} сессий</span>
                    <span className="text-sm text-[var(--soft-ink-faint)]">Опыт: {p.experience}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--soft-ink-faint)]">Языки: {p.languages.join(", ")}</p>
                </div>
              </div>
            </header>

            <div className="mt-6 flex flex-wrap gap-2">
              {(p.specialties as string[]).map((s) => (
                <span key={s} className="soft-chip soft-chip-warm">{SPECIALTY_LABELS[s] ?? s}</span>
              ))}
              {p.tags.map((tag) => (
                <span key={tag} className="soft-chip">{tag}</span>
              ))}
            </div>

            <section className="soft-public-section">
              <h2 className="soft-h2">О практике</h2>
              <p className="mt-4 max-w-3xl leading-relaxed text-[var(--soft-ink-soft)]">{p.bio}</p>
            </section>

            <section className="soft-public-section">
              <h2 className="soft-h2">Как проходит сессия</h2>
              <div className="soft-public-grid-2 mt-5">
                {[
                  { n: "01", title: "Выбираете слот", text: "Удобное время в календаре" },
                  { n: "02", title: "Оплачиваете", text: "Деньги удерживаются до завершения" },
                  { n: "03", title: "Проводите сессию", text: "Видеочат прямо на платформе" },
                  { n: "04", title: "Оставляете отзыв", text: "Рейтинг обновляется после подтвержденной сессии" },
                ].map((step) => (
                  <div key={step.title} className="soft-card soft-timeline-item">
                    <span className="soft-step-number">{step.n}</span>
                    <div>
                      <p className="font-semibold text-[var(--soft-bordeaux)]">{step.title}</p>
                      <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="soft-public-section">
              <h2 className="soft-h2">Отзывы ({p.reviewCount})</h2>
              <p className="mt-1 text-sm text-[var(--soft-ink-faint)]">Только от подтвержденных оплаченных сессий</p>
              {p.reviews.length === 0 ? (
                <p className="soft-card mt-4 p-4 text-sm text-[var(--soft-ink-faint)]">Пока нет отзывов.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {p.reviews.map((review) => (
                    <article key={review.id} className="soft-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-[var(--soft-bordeaux)]">{review.author.name}</span>
                        <div className="flex items-center gap-2">
                          <StarRating rating={review.rating} />
                          <span className="text-xs text-[var(--soft-ink-faint)]">
                            {new Date(review.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                          </span>
                        </div>
                      </div>
                      {review.text ? <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{review.text}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="soft-card soft-booking-card md:self-start">
            <div className="text-center">
              <p className="soft-eyebrow">Запись</p>
              <p className="soft-price mt-3">
                {(firstRate?.priceRub ?? p.pricePerSession).toLocaleString("ru")} ₽
              </p>
              <p className="mt-1 text-sm text-[var(--soft-ink-faint)]">
                {firstRate ? `от ${firstRate.durationMin} минут` : "за сессию"}
              </p>
            </div>

            <div className="mt-6">
              <SlotPicker practitionerId={p.id} practitionerName={p.user.name} />
            </div>

            <div className="mt-5 space-y-2 text-xs text-[var(--soft-ink-faint)]">
              {[
                "Деньги удерживаются до завершения сессии",
                "Возврат при нарушении этического кодекса",
                "Практик проверен ETerapy",
              ].map((t) => (
                <p key={t} className="flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-[var(--soft-terracotta)]" aria-hidden="true" />
                  {t}
                </p>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
