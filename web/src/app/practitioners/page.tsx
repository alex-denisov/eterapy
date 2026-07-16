export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { getDeprioritizedPractitionerIds, partitionByReliability } from "@/lib/practitioner-reliability";
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

  const mapped = practitioners.map((p) => {
    const minRate = p.priceRates[0];
    return {
      id: p.id,
      slug: p.slug,
      name: p.user.name,
      title: p.title,
      bio: p.bio,
      categories: p.categories,
      directions: p.directions,
      specialties: p.specialties as string[],
      tags: p.tags,
      pricePerSession: minRate?.priceRub ?? p.pricePerSession,
      minDuration: minRate?.durationMin ?? 50,
      verified: p.verified,
      rating: p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0,
      reviewCount: p.reviewCount,
      sessionCount: p.sessionCount,
    };
  });

  // B346/Интерфейс 8-9: the catalog is purely DB-backed — no hardcoded demo
  // personas. Every card therefore links to a real, working practitioner page.
  // B484: практики, превысившие пороги поздних отмен/неявок за 30 дней,
  // временно опускаются в конец выдачи (санкция «приоритет каталога»).
  const deprioritized = await getDeprioritizedPractitionerIds(mapped.map((p) => p.id)).catch(() => new Set<string>());
  return partitionByReliability(mapped, deprioritized);
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

          {/* B457 (item 7): not «dead» chips — a short note + one real CTA into
              the «Эзотерика» tab. Same checks (verification, ethics, price) apply. */}
          <div className="soft-card-flat p-5" style={{ maxWidth: 320 }}>
            <p className="soft-eyebrow mb-2">не только психология</p>
            <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Таро, астрология, нумерология и другие практики — для тех, кому ближе
              символический язык. Те же проверка и этический кодекс, цена видна до записи.
            </p>
            <Link
              href="/practitioners?format=esoteric#specialists"
              className="soft-button soft-button-ghost mt-4 inline-flex text-sm"
            >
              Смотреть эзотерику
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Grid with filters */}
      <section id="specialists" className="soft-shell py-8" style={{ scrollMarginTop: 84 }}>
        <PractitionersGrid practitioners={practitioners} />
      </section>
    </main>
  );
}
