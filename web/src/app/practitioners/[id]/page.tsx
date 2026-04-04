import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { SPECIALTY_LABELS } from "@/lib/types";
import { SlotPicker } from "./slot-picker";

async function getPractitioner(id: string) {
  return db.practitioner.findFirst({
    where: { id, status: PractitionerStatus.ACTIVE },
    include: {
      user: { select: { name: true } },
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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPractitioner(id);
  if (!p) return { title: "Практик не найден" };
  return {
    title: `${p.user.name} — ETerapy`,
    description: p.bio.slice(0, 160),
  };
}

export default async function PractitionerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPractitioner(id);
  if (!p) notFound();

  const rating = p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Хлебные крошки */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Главная</Link>
        <span>/</span>
        <Link href="/practitioners" className="hover:text-foreground">Каталог</Link>
        <span>/</span>
        <span className="text-foreground">{p.user.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        {/* Левая колонка */}
        <div>
          <div className="flex items-start gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/10 text-3xl font-bold text-primary ring-2 ring-primary/20">
              {p.user.name.charAt(0)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-bold md:text-3xl">{p.user.name}</h1>
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

          {/* Специализации */}
          <div className="mt-6 flex flex-wrap gap-2">
            {(p.specialties as string[]).map((s) => (
              <Badge key={s} variant="secondary" className="bg-primary/10 text-primary">
                {SPECIALTY_LABELS[s] ?? s}
              </Badge>
            ))}
            {p.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-border/30 px-3 py-0.5 text-sm text-muted-foreground">{tag}</span>
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
                { icon: "📅", title: "Выбираете слот", text: "Удобное время в календаре" },
                { icon: "💳", title: "Оплачиваете", text: "Деньги удерживаются до завершения" },
                { icon: "📹", title: "Проводите сессию", text: "Видеочат прямо на платформе" },
                { icon: "✦", title: "Оставляете отзыв", text: "Деньги поступают практику" },
              ].map((step) => (
                <div key={step.title} className="flex gap-3 rounded-xl border border-border/30 bg-card/30 p-4">
                  <span className="text-2xl">{step.icon}</span>
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
                <p className="font-heading text-3xl font-bold text-primary">
                  {p.pricePerSession.toLocaleString("ru")} ₽
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  за сессию {p.sessionDuration ?? 60} мин
                </p>
              </div>

              <SlotPicker
                practitionerId={p.id}
                practitionerName={p.user.name}
                pricePerSession={p.pricePerSession}
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
    </div>
  );
}
