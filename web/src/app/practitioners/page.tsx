export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { PractitionersGrid } from "./practitioners-grid";

async function getPractitioners() {
  const practitioners = await db.practitioner.findMany({
    where: { status: PractitionerStatus.ACTIVE },
    include: {
      user: { select: { name: true } },
      priceRates: { where: { enabled: true }, orderBy: { priceRub: "asc" }, take: 1 },
    },
    orderBy: { reviewCount: "desc" },
  }).catch(() => []);

  return practitioners.map((p) => {
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
              Специалист как следующий шаг — после того, как вы сформулировали вопрос.
              Сначала контекст вопроса, затем подбор. Это не основной вход в продукт.
            </p>
            <p className="mt-2 text-sm text-[var(--soft-ink-faint)]">
              Каждый специалист проходит проверку диплома, опыта и подписывает этический кодекс.
              Цена видна до записи. Жалоба — в один клик.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/checkin"
                className="soft-button soft-button-primary"
                data-testid="practitioner-secondary-dialogue-cta"
                data-analytics-event="dialogue_cta_clicked"
                data-analytics-target="/checkin"
              >
                Задать вопрос
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/how-it-works" className="soft-button soft-button-ghost">
                Как работает подбор
              </Link>
            </div>
          </div>

          <div className="soft-card p-5" style={{ maxWidth: 320 }}>
            <p className="soft-eyebrow mb-3">скоро в каталоге</p>
            <div className="flex flex-wrap gap-2">
              {["Таро", "Астрология", "Нумерология", "Совместные сессии", "Обучение"].map((label) => (
                <span key={label} className="soft-chip text-xs px-3 py-1.5 opacity-70">
                  {label}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--soft-ink-faint)]">
              Таро, астрология, нумерология и совместные сессии — в листе ожидания.
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
