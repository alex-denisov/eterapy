export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { SPECIALTY_LABELS } from "@/lib/types";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

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
      experience: p.experience,
      pricePerSession: minRate?.priceRub ?? p.pricePerSession,
      minDuration: minRate?.durationMin ?? 60,
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
  const featuredPractitioners = practitioners.slice(0, 3);

  return (
    <main className="soft-clarity-page soft-public-page">
      <PublicJsonLd route="/practitioners" />

      <section className="soft-shell soft-public-hero">
        <div>
          <p className="soft-eyebrow">Специалист как следующий шаг</p>
          <h1 className="soft-h1 mt-4">Сначала контекст вопроса, потом подходящий специалист</h1>
          <p className="soft-lede mt-5 max-w-2xl">
            ETerapy больше не ведет пользователя в каталог без понимания ситуации.
            Задайте вопрос, получите первичный ответ и только затем выбирайте специалиста,
            если живой разговор действительно нужен.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
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

        <aside className="soft-card soft-form-panel">
          <div className="flex items-start gap-3">
            <span className="soft-avatar shrink-0" aria-hidden="true">
              <MessageCircleQuestion className="size-7" />
            </span>
            <div>
              <h2 className="soft-h3">Рекомендация после ответа</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Вы увидите 2-3 специалиста с объяснением, почему они подходят под тему,
                формат и уровень сложности вашего вопроса.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {[
              { icon: BadgeCheck, title: "Верификация", text: "Профиль, этика и правила платформы." },
              { icon: CalendarDays, title: "Фиксированные пакеты", text: "20/50 минут или серия сессий." },
              { icon: ShieldCheck, title: "Без давления", text: "Кризисные и рискованные темы не монетизируются." },
            ].map((item) => (
              <div key={item.title} className="rounded-[var(--soft-radius-md)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] p-3">
                <item.icon className="size-4 text-[var(--soft-terracotta)]" />
                <p className="mt-2 text-sm font-semibold text-[var(--soft-bordeaux)]">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--soft-ink-soft)]">{item.text}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="soft-shell soft-public-section">
        <div className="soft-card soft-form-panel">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="soft-eyebrow">Проверенные специалисты</p>
              <h2 className="soft-h2 mt-3">
                {practitioners.length} {pluralize(practitioners.length, "специалист", "специалиста", "специалистов")}
              </h2>
              <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
                Доступны в рекомендательном слое после диалога.
              </p>
            </div>
            <p className="text-sm text-[var(--soft-ink-faint)]">Это не основной вход в продукт.</p>
          </div>

          <div className="soft-public-grid mt-6">
            {featuredPractitioners.map((p) => (
              <article key={p.id} className="soft-card soft-practitioner-card" data-testid="practitioner-secondary-card">
                <div className="flex items-start gap-4">
                  <div className="soft-avatar shrink-0">{p.name.charAt(0)}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="soft-h3 truncate">{p.name}</h3>
                      {p.verified ? <BadgeCheck className="size-4 shrink-0 text-[var(--soft-terracotta)]" aria-label="Проверен ETerapy" /> : null}
                    </div>
                    <p className="mt-1 text-sm text-[var(--soft-ink-faint)]">{p.title}</p>
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-[var(--soft-ink-soft)]">{p.bio}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.specialties.slice(0, 2).map((specialty) => (
                    <span key={specialty} className="soft-chip">
                      {SPECIALTY_LABELS[specialty] ?? specialty}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex items-end justify-between border-t border-[var(--soft-paper-edge)] pt-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">{p.pricePerSession.toLocaleString("ru")} ₽</p>
                    <p className="text-xs text-[var(--soft-ink-faint)]">от {p.minDuration} минут</p>
                  </div>
                  <Link href={`/practitioners/${p.slug}`} className="text-sm font-semibold text-[var(--soft-terracotta-dark)] hover:text-[var(--soft-bordeaux)]">
                    Профиль
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-5 text-xs leading-5 text-[var(--soft-ink-faint)]">
            Полный каталог с фильтрами убран из публичного первого шага. Прямые профили сохраняются
            для SEO и существующих ссылок, но пользовательский путь начинается с вопроса.
          </p>
        </div>
      </section>
    </main>
  );
}
