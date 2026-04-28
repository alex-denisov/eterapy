export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { SPECIALTY_LABELS } from "@/lib/types";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { buttonVariants } from "@/lib/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// Серверная загрузка — быстрый SSR без клиентского fetch
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
    // Минимальный активный тариф или базовая цена
    const minRate = p.priceRates[0];
    return {
      id: p.id,
      slug: p.slug,
      name: p.user.name,
      title: p.title,
      bio: p.bio,
      specialties: p.specialties as string[],
      tags: p.tags,
      experience: p.experience,
      pricePerSession: minRate?.priceRub ?? p.pricePerSession,
      minDuration: minRate?.durationMin ?? 60,
      languages: p.languages,
      verified: p.verified,
      founding: p.founding,
      rating: p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0,
      reviewCount: p.reviewCount,
      sessionCount: p.sessionCount,
      online: false,
      nextSlot: null as string | null,
    };
  });
}

export const metadata = createPublicPageMetadata("/practitioners");

export default async function PractitionersPage() {
  const practitioners = await getPractitioners();
  const featuredPractitioners = practitioners.slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <PublicJsonLd route="/practitioners" />
      <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Специалист как следующий шаг</p>
          <h1 className="mt-3 font-heading text-3xl font-bold leading-tight md:text-5xl">
            Сначала контекст вопроса, потом подходящий практик
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            ETerapy больше не ведет пользователя в каталог без понимания ситуации. Задайте вопрос,
            получите первичный ответ и только затем выбирайте специалиста, если живой разговор
            действительно нужен.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/all-modalities/checkin"
              className={cn(buttonVariants({ size: "lg" }))}
              data-testid="practitioner-secondary-dialogue-cta"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
            >
              Задать вопрос
              <ArrowRight />
            </Link>
            <Link href="/how-it-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Как работает подбор
            </Link>
          </div>
        </div>

        <Card className="border-border/40 bg-card/55">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <MessageCircleQuestion className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="font-heading text-lg font-semibold">Рекомендация после ответа</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Пользователь видит 2-3 практиков с объяснением, почему они подходят под тему,
                  формат и уровень сложности запроса.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { icon: BadgeCheck, title: "Верификация", text: "Профиль, этика и правила платформы." },
                { icon: CalendarDays, title: "Фиксированные пакеты", text: "20/50 минут или серия сессий." },
                { icon: ShieldCheck, title: "Без давления", text: "Кризисные и рискованные темы не монетизируются." },
              ].map((item) => (
                <div key={item.title} className="rounded-[var(--radius-card)] border border-border/35 bg-background/45 p-3">
                  <item.icon className="size-4 text-primary" />
                  <p className="mt-2 text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-12 rounded-[var(--radius-card)] border border-border/40 bg-card/45 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-semibold">Проверенные специалисты</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {practitioners.length} {pluralize(practitioners.length, "верифицированный специалист", "верифицированных специалиста", "верифицированных специалистов")} доступны в рекомендательном слое после диалога.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Это не основной вход в продукт.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {featuredPractitioners.map((p) => (
            <article key={p.id} className="rounded-[var(--radius-card)] border border-border/35 bg-background/45 p-4" data-testid="practitioner-secondary-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-heading font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.title}</p>
                </div>
                {p.verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Проверен ETerapy" /> : null}
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{p.bio}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.specialties.slice(0, 2).map((specialty) => (
                  <span key={specialty} className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    {SPECIALTY_LABELS[specialty] ?? specialty}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-end justify-between border-t border-border/30 pt-4">
                <div>
                  <p className="text-sm font-semibold text-primary">{p.pricePerSession.toLocaleString("ru")} ₽</p>
                  <p className="text-xs text-muted-foreground">от {p.minDuration} минут</p>
                </div>
                <Link href={`/practitioners/${p.slug}`} className="text-sm text-primary hover:underline">
                  Профиль
                </Link>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          Полный каталог с фильтрами убран из публичного первого шага. Прямые профили сохраняются на один релиз
          для SEO и существующих ссылок, но пользовательский путь начинается с вопроса.
        </p>
      </section>
    </div>
  );
}
