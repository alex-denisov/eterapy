export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { CalendarDays, ShieldCheck, Sparkles } from "lucide-react";
import { PractitionerStatus } from "@prisma/client";
import db from "@/lib/db";
import { mainUrl } from "@/lib/subdomain";
import { ByocVisitTracker } from "./byoc-visit-tracker";

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
};

async function getPractitioner(slug: string) {
  return db.practitioner.findFirst({
    where: { slug, status: PractitionerStatus.ACTIVE, verified: true },
    include: {
      user: { select: { name: true } },
      priceRates: { where: { enabled: true }, orderBy: { priceRub: "asc" }, take: 1 },
    },
  });
}

export async function generateMetadata({ params }: Pick<Params, "params">): Promise<Metadata> {
  const { slug } = await params;
  const practitioner = await getPractitioner(slug).catch(() => null);
  if (!practitioner) return { title: "Личная ссылка практика — ETerapy" };
  return {
    title: `${practitioner.user.name}: личная ссылка для записи — ETerapy`,
    description: "Познакомьтесь со специалистом, получите бесплатный короткий разбор и выберите удобное время.",
    alternates: { canonical: mainUrl(`/p/${slug}`) },
    robots: { index: false, follow: false },
  };
}

export default async function PractitionerByocLanding({ params, searchParams }: Params) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const practitioner = await getPractitioner(slug);
  if (!practitioner) notFound();

  const invite = query.ref
    ? await db.practitionerInvite.findFirst({
        where: { token: query.ref, practitionerId: practitioner.id, status: "ACTIVE" },
        select: { token: true, label: true, freeAiHook: true },
      })
    : null;
  if (query.ref && !invite) redirect(mainUrl(`/practitioners/${practitioner.slug}`));

  const firstRate = practitioner.priceRates[0];
  const price = firstRate?.priceRub ?? practitioner.pricePerSession;
  const duration = firstRate?.durationMin ?? practitioner.sessionDuration;
  const profileHref = mainUrl(`/practitioners/${practitioner.slug}?source=byoc`);
  const hook = invite?.freeAiHook || "Бесплатный короткий AI-разбор перед первой записью";

  return (
    <main className="soft-clarity-page soft-public-page">
      {invite && <ByocVisitTracker slug={practitioner.slug} token={invite.token} />}
      <section className="soft-shell grid gap-8 py-10 md:grid-cols-[1.05fr_0.95fr] md:items-start md:py-14">
        <div className="space-y-5">
          <Link href={mainUrl(`/practitioners/${practitioner.slug}`)} className="soft-chip inline-flex">
            ← Профиль специалиста
          </Link>
          <div>
            <p className="soft-eyebrow">личная ссылка практика</p>
            <h1 className="soft-h1 mt-2">{practitioner.user.name}</h1>
            <p className="mt-2 text-base text-[var(--soft-ink-soft)]">{practitioner.title}</p>
          </div>
          <p className="max-w-2xl text-lg leading-relaxed text-[var(--soft-ink-soft)]">{practitioner.bio}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/80 p-4">
              <CalendarDays className="mb-2 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm text-[var(--soft-ink-soft)]">от {price.toLocaleString("ru-RU")} ₽</p>
              <p className="text-xs text-[var(--soft-ink-faint)]">{duration} минут · онлайн</p>
            </div>
            <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/80 p-4">
              <Sparkles className="mb-2 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm text-[var(--soft-ink-soft)]">Бесплатный разбор</p>
              <p className="text-xs text-[var(--soft-ink-faint)]">короткий, перед записью</p>
            </div>
            <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/80 p-4">
              <ShieldCheck className="mb-2 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm text-[var(--soft-ink-soft)]">Безопасная оплата</p>
              <p className="text-xs text-[var(--soft-ink-faint)]">онлайн через ETerapy</p>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-cream)] p-6 shadow-sm">
          <p className="soft-eyebrow">первый шаг</p>
          <h2 className="mt-2 text-2xl font-semibold">Запись через личную ссылку</h2>
          <p className="mt-4 leading-relaxed text-[var(--soft-ink-soft)]">{hook}</p>
          <div className="mt-6 flex flex-col gap-3">
            <Link href={profileHref} className="soft-button soft-button-primary justify-center">
              Выбрать время
            </Link>
            <Link href={mainUrl(`/p/${practitioner.slug}/precheck?source=byoc`)} className="soft-button soft-button-ghost justify-center">
              Бесплатный короткий разбор
            </Link>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            Это личная ссылка вашего специалиста, чтобы записаться напрямую. Цена для вас та же, а оплата проходит безопасно через ETerapy.
          </p>
        </aside>
      </section>
    </main>
  );
}
