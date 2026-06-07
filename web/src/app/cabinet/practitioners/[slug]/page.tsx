export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { SPECIALTY_LABELS } from "@/lib/types";
import { SlotPicker } from "@/app/practitioners/[slug]/slot-picker";
import { appUrl } from "@/lib/subdomain";

async function getPractitioner(slug: string) {
  return db.practitioner.findFirst({
    where: { slug, status: PractitionerStatus.ACTIVE },
    include: {
      user: { select: { name: true, avatarUrl: true } },
      priceRates: { where: { enabled: true }, orderBy: { priceRub: "asc" } },
      reviews: {
        where: { status: "PUBLISHED" },
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
        <span key={i} className={i <= stars ? "text-[var(--soft-bordeaux)]" : "text-[var(--soft-paper-edge)]"}>★</span>
      ))}
      <span className="ml-1 font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

export default async function CabinetPractitionerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPractitioner(slug);
  if (!p) notFound();

  const rating = p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumbs */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--soft-ink-soft)]">
        <Link href={appUrl("")} className="hover:text-[var(--soft-ink)]">Кабинет</Link>
        <span>/</span>
        <Link href={appUrl("/practitioners")} className="hover:text-[var(--soft-ink)]">Практики</Link>
        <span>/</span>
        <span className="text-[var(--soft-ink)]">{p.user.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-start gap-5">
        {p.user.avatarUrl ? (
          // User-set avatar from arbitrary storage URLs — next/image would need
          // per-host remotePatterns config for a 64px image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.user.avatarUrl} alt={p.user.name} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-[rgba(255,255,255,0.035)] flex items-center justify-center text-xl font-bold text-[var(--soft-bordeaux)]">
            {p.user.name[0]}
          </div>
        )}
        <div>
          <h1 className="font-heading text-2xl font-bold">{p.user.name}</h1>
          <p className="text-[var(--soft-ink-soft)]">{p.title}</p>
          {rating > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <StarRating rating={rating} />
              <span className="text-xs text-[var(--soft-ink-soft)]">({p.reviewCount} отзывов)</span>
            </div>
          )}
        </div>
      </div>

      {/* Bio */}
      <div className="soft-card mb-6">
        <div className="p-6">
          <h2 className="font-heading text-lg font-semibold mb-3">О практикe</h2>
          <p className="text-[var(--soft-ink)] whitespace-pre-wrap">{p.bio}</p>
          {p.experience && (
            <p className="mt-3 text-sm text-[var(--soft-ink-soft)]">Опыт: {p.experience}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {p.specialties.map((s) => (
              <span key={s} className="soft-chip text-xs">{SPECIALTY_LABELS[s] ?? s}</span>
            ))}
          </div>
          {p.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.tags.map((t) => (
                <span key={t} className="rounded bg-[rgba(255,255,255,0.035)] px-2 py-0.5 text-xs text-[var(--soft-bordeaux)]">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Price rates */}
      {p.priceRates.length > 0 && (
        <div className="soft-card mb-6">
          <div className="p-6">
            <h2 className="font-heading text-lg font-semibold mb-3">Стоимость сессий</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {p.priceRates.map((rate) => (
                <div key={rate.id} className="flex items-center justify-between rounded-lg border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.015)] p-4">
                  <div>
                    <p className="font-medium">{rate.durationMin} мин</p>
                    <p className="text-xs text-[var(--soft-ink-soft)]">
                      {rate.enabled ? "Активен" : "Отключен"}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-[var(--soft-bordeaux)]">{rate.priceRub.toLocaleString("ru")} ₽</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Booking */}
      <SlotPicker
        practitionerId={p.id}
        practitionerName={p.user.name}
      />

      {/* Reviews */}
      {p.reviews.length > 0 && (
        <div className="soft-card mt-6">
          <div className="p-6">
            <h2 className="font-heading text-lg font-semibold mb-4">Отзывы</h2>
            <div className="space-y-4">
              {p.reviews.map((r) => (
                <div key={r.id} className="rounded-lg border border-[var(--soft-paper-edge)] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[var(--soft-ink)]">{r.author.name}</span>
                    <div className="flex items-center gap-1 text-xs text-[var(--soft-ink-soft)]">
                      {r.rating && <span className="text-[var(--soft-bordeaux)]">{"★".repeat(r.rating)}</span>}
                      <span>{new Date(r.createdAt).toLocaleDateString("ru")}</span>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--soft-ink)] opacity-80">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
