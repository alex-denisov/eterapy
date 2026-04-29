export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PremiumCard, PremiumPage } from "@/components/v5/premium";
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

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const stars = Math.round(rating);
  return (
    <span className={`flex items-center gap-0.5 ${size === "lg" ? "text-base" : "text-sm"}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= stars ? "text-primary" : "text-border/60"}>★</span>
      ))}
      <span className="ml-1 font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}


export default async function PractitionerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPractitioner(slug);
  if (!p) notFound();

  const rating = p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0;

  return (
    <PremiumPage className="mx-auto max-w-5xl px-4 py-12">
      {/* Хлебные крошки */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Главная</Link>
        <span>/</span>
        <Link href="/practitioners" className="hover:text-foreground">Специалисты</Link>
        <span>/</span>
        <span className="text-foreground">{p.user.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-[1fr_340px]">
        {/* Левая колонка */}
        <div>
          <PremiumCard className="p-5">
          <div className="flex items-start gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[var(--radius-card)] border border-primary/25 bg-primary/10 font-heading text-3xl font-medium text-primary shadow-[var(--shadow-halo-soft)]">
              {p.user.name.charAt(0)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-3xl font-medium md:text-4xl">{p.user.name}</h1>
                {p.verified && <Badge className="bg-primary/10 text-primary">✦ Проверен ETerapy</Badge>}
                {p.founding && <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 text-xs">Основатель</Badge>}
              </div>
              <p className="mt-1 text-muted-foreground">{p.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <StarRating rating={rating} size="lg" />
                <span className="text-sm text-muted-foreground">{p.reviewCount} отзывов</span>
                <span className="text-sm text-muted-foreground">{p.sessionCount} сессий</span>
                <span className="text-sm text-muted-foreground">Опыт: {p.experience}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Языки: {p.languages.join(", ")}
              </p>
            </div>
          </div>
          </PremiumCard>

          {/* Специализации */}
          <div className="mt-6 flex flex-wrap gap-2">
            {(p.specialties as string[]).map((s) => (
              <Badge key={s} variant="secondary" className="bg-primary/10 text-primary">
                {SPECIALTY_LABELS[s] ?? s}
              </Badge>
            ))}
            {p.tags.map((tag) => (
              <span key={tag} className="premium-chip">{tag}</span>
            ))}
          </div>

          {/* О практике */}
          <div className="mt-8">
            <h2 className="font-heading text-xl font-semibold">О практике</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{p.bio}</p>
          </div>

          {/* Как проходит сессия */}
          <div className="mt-8">
            <h2 className="font-heading text-xl font-semibold">Как проходит сессия</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { icon: "01", title: "Выбираете слот", text: "Удобное время в календаре" },
                { icon: "02", title: "Оплачиваете", text: "Деньги удерживаются до завершения" },
                { icon: "03", title: "Проводите сессию", text: "Видеочат прямо на платформе" },
                { icon: "04", title: "Оставляете отзыв", text: "Деньги поступают практику" },
              ].map((step) => (
                <div key={step.title} className="premium-card flex gap-3 p-4">
                  <span className="font-heading text-2xl text-primary">{step.icon}</span>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Отзывы */}
          <div className="mt-8">
            <h2 className="font-heading text-xl font-semibold">Отзывы ({p.reviewCount})</h2>
            <p className="mt-1 text-sm text-muted-foreground">Только от подтверждённых оплаченных сессий</p>
            {p.reviews.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground/60">Пока нет отзывов.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {p.reviews.map((review) => (
                  <Card key={review.id} className="border-border/30 bg-card/30">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{review.author.name}</span>
                        <div className="flex items-center gap-2">
                          <StarRating rating={review.rating} />
                          <span className="text-xs text-muted-foreground">
                            {new Date(review.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                          </span>
                        </div>
                      </div>
                      {review.text && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{review.text}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Правая колонка — бронирование */}
        <div className="md:sticky md:top-24 md:self-start">
          <Card className="border-primary/20 bg-card/50">
            <CardContent className="p-6">
              <div className="text-center">
                {p.priceRates.length > 0 ? (
                  <>
                    <p className="font-heading text-3xl font-bold text-primary tabular-nums">
                      {p.priceRates[0].priceRub.toLocaleString("ru")} ₽
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      от {p.priceRates[0].durationMin} минут
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-heading text-3xl font-bold text-primary tabular-nums">
                      {p.pricePerSession.toLocaleString("ru")} ₽
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">за сессию</p>
                  </>
                )}
              </div>

              <SlotPicker
                practitionerId={p.id}
                practitionerName={p.user.name}
              />

              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                {[
                  "Деньги удерживаются до завершения сессии",
                  "Возврат при нарушении этического кодекса",
                  "Практик проверен ETerapy",
                ].map((t) => (
                  <p key={t} className="flex items-center gap-2">
                    <span className="text-primary">✦</span> {t}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PremiumPage>
  );
}
