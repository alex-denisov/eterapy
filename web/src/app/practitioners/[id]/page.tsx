import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { practitioners, SPECIALTY_LABELS } from "@/data/practitioners";
import { BookingButton } from "./booking-button";

export function generateStaticParams() {
  return practitioners.map((p) => ({ id: p.id }));
}

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const stars = Math.round(rating);
  return (
    <span className={`flex items-center gap-1 ${size === "lg" ? "text-base" : "text-sm"}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= stars ? "text-primary" : "text-border"}>★</span>
      ))}
      <span className="ml-1 font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

export default async function PractitionerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = practitioners.find((pr) => pr.id === id);
  if (!p) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Хлебные крошки */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Главная</Link>
        <span>/</span>
        <Link href="/practitioners" className="hover:text-foreground">Каталог</Link>
        <span>/</span>
        <span className="text-foreground">{p.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        {/* Левая колонка — основная информация */}
        <div>
          {/* Шапка профиля */}
          <div className="flex items-start gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/10 text-5xl ring-2 ring-primary/20">
              {p.avatar}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-bold md:text-3xl">{p.name}</h1>
                {p.verified && (
                  <Badge className="bg-primary/10 text-primary">
                    ✦ Проверен ETerapy
                  </Badge>
                )}
                {p.founding && (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 text-xs">
                    Основатель
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-muted-foreground">{p.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <StarRating rating={p.rating} size="lg" />
                <span className="text-sm text-muted-foreground">{p.reviewCount} отзывов</span>
                <span className="text-sm text-muted-foreground">{p.sessionCount} сессий</span>
                <span className="text-sm text-muted-foreground">Опыт: {p.experience}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p.online && (
                  <span className="flex items-center gap-1.5 text-sm text-green-400">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Онлайн сейчас
                  </span>
                )}
                <span className="text-sm text-muted-foreground">
                  Языки: {p.languages.join(", ")}
                </span>
              </div>
            </div>
          </div>

          {/* Специализации */}
          <div className="mt-6 flex flex-wrap gap-2">
            {p.specialties.map((s) => (
              <Badge key={s} variant="secondary" className="bg-primary/10 text-primary">
                {SPECIALTY_LABELS[s]}
              </Badge>
            ))}
            {p.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-border/30 px-3 py-0.5 text-sm text-muted-foreground">
                {tag}
              </span>
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
            <h2 className="font-heading text-xl font-semibold">
              Отзывы ({p.reviewCount})
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Только от подтверждённых оплаченных сессий
            </p>
            <div className="mt-4 space-y-4">
              {p.reviews.map((review, i) => (
                <Card key={i} className="border-border/30 bg-card/30">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{review.author}</span>
                      <div className="flex items-center gap-2">
                        <StarRating rating={review.rating} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(review.date).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "long",
                          })}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {review.text}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
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
                <p className="mt-1 text-sm text-muted-foreground">фиксированная цена за сессию</p>
              </div>

              {p.nextSlot && (
                <div className="mt-4 rounded-xl bg-green-500/10 p-3 text-center">
                  <p className="text-sm font-medium text-green-400">
                    Ближайший слот: {p.nextSlot}
                  </p>
                </div>
              )}

              <BookingButton practitionerName={p.name} nextSlot={p.nextSlot} />

              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <span className="text-primary">✦</span>
                  Деньги удерживаются до завершения сессии
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-primary">✦</span>
                  Возврат при нарушении этического кодекса
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-primary">✦</span>
                  Практик проверен ETerapy
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
