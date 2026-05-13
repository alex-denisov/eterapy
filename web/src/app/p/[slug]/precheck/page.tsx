export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PractitionerStatus } from "@prisma/client";
import db from "@/lib/db";
import { mainUrl } from "@/lib/subdomain";
import { practitionerPrecheckUrl } from "@/lib/practitioner-links";
import { PrecheckForm } from "./precheck-form";

type Params = { params: Promise<{ slug: string }> };

async function getPractitioner(slug: string) {
  return db.practitioner.findFirst({
    where: { slug, status: PractitionerStatus.ACTIVE },
    include: {
      user: { select: { name: true } },
      priceRates: { where: { enabled: true }, orderBy: { priceRub: "asc" }, take: 1 },
    },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const practitioner = await getPractitioner(slug).catch(() => null);
  if (!practitioner) return { title: "Предразбор — ETerapy" };
  return {
    title: `Предразбор перед встречей с ${practitioner.user.name} — ETerapy`,
    description: "Коротко сформулируйте вопрос, получите первичную карту контекста и перейдите к записи.",
    alternates: { canonical: practitionerPrecheckUrl(slug) },
    robots: { index: false, follow: false },
  };
}

export default async function PractitionerPrecheckPage({ params }: Params) {
  const { slug } = await params;
  const practitioner = await getPractitioner(slug);
  if (!practitioner) notFound();

  const firstRate = practitioner.priceRates[0];
  const price = firstRate?.priceRub ?? practitioner.pricePerSession;
  const duration = firstRate?.durationMin ?? practitioner.sessionDuration;
  const profileHref = mainUrl(`/practitioners/${practitioner.slug}`);

  return (
    <main className="soft-clarity-page soft-public-page">
      <section className="soft-shell grid gap-8 py-10 md:grid-cols-[0.92fr_1.08fr] md:items-start md:py-14">
        <aside className="md:sticky md:top-20">
          <Link href={profileHref} className="soft-chip mb-5 inline-flex">
            ← Профиль специалиста
          </Link>
          <div className="soft-card p-6">
            <p className="soft-eyebrow">личная ссылка практика</p>
            <h1 className="soft-h1 mt-2">Предразбор перед встречей</h1>
            <p className="mt-4 text-base leading-relaxed text-[var(--soft-ink-soft)]">
              {practitioner.user.name} увидит, с каким вопросом вы приходите, а вы получите короткую карту контекста
              до выбора времени.
            </p>
            <div className="mt-5 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] p-4">
              <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">{practitioner.user.name}</p>
              <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{practitioner.title}</p>
              <p className="mt-3 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">
                от {price.toLocaleString("ru-RU")} ₽
              </p>
              <p className="text-xs text-[var(--soft-ink-faint)]">{duration} минут · онлайн</p>
            </div>
          </div>

          <div className="soft-card-flat mt-4 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Предразбор не заменяет консультацию и не содержит обещаний результата. Если есть риск себе или другим,
                платформа покажет безопасный маршрут вместо записи.
              </p>
            </div>
          </div>
        </aside>

        <PrecheckForm
          practitionerId={practitioner.id}
          practitionerSlug={practitioner.slug}
          practitionerName={practitioner.user.name}
          profileHref={profileHref}
        />
      </section>
    </main>
  );
}
