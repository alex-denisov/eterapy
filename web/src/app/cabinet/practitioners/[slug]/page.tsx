export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
        <span key={i} className={i <= stars ? "text-primary" : "text-border/60"}>★</span>
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
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={appUrl("/cabinet")} className="hover:text-foreground">Кабинет</Link>
        <span>/</span>
        <Link href={appUrl("/cabinet/practitioners")} className="hover:text-foreground">Практики</Link>
        <span>/</span>
        <span className="text-foreground">{p.user.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-start gap-5">
        {p.user.avatarUrl ? (
          <img src={p.user.avatarUrl} alt={p.user.name} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary">
            {p.user.name[0]}
          </div>
        )}
        <div>
          <h1 className="font-heading text-2xl font-bold">{p.user.name}</h1>
          <p className="text-muted-foreground">{p.title}</p>
          {rating > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <StarRating rating={rating} />
              <span className="text-xs text-muted-foreground">({p.reviewCount} отзывов)</span>
            </div>
          )}
        </div>
      </div>

      {/* Bio */}
      <Card className="mb-6 border-border/30 bg-card/30">
        <CardContent className="p-6">
          <h2 className="font-heading text-lg font-semibold mb-3">О практикe</h2>
          <p className="text-foreground/80 whitespace-pre-wrap">{p.bio}</p>
          {p.experience && (
            <p className="mt-3 text-sm text-muted-foreground">Опыт: {p.experience}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {p.specialties.map((s) => (
              <Badge key={s} variant="secondary">{SPECIALTY_LABELS[s] ?? s}</Badge>
            ))}
          </div>
          {p.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.tags.map((t) => (
                <span key={t} className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{t}</span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Price rates */}
      {p.priceRates.length > 0 && (
        <Card className="mb-6 border-border/30 bg-card/30">
          <CardContent className="p-6">
            <h2 className="font-heading text-lg font-semibold mb-3">Стоимость сессий</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {p.priceRates.map((rate) => (
                <div key={rate.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-card/50 p-4">
                  <div>
                    <p className="font-medium">{rate.durationMin} мин</p>
                    <p className="text-xs text-muted-foreground">
                      {rate.enabled ? "Активен" : "Отключен"}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-primary">{rate.priceRub.toLocaleString("ru")} ₽</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Booking */}
      <SlotPicker
        practitionerId={p.id}
        practitionerName={p.user.name}
      />

      {/* Reviews */}
      {p.reviews.length > 0 && (
        <Card className="mt-6 border-border/30 bg-card/30">
          <CardContent className="p-6">
            <h2 className="font-heading text-lg font-semibold mb-4">Отзывы</h2>
            <div className="space-y-4">
              {p.reviews.map((r) => (
                <div key={r.id} className="rounded-lg border border-border/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{r.author.name}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {r.rating && <span className="text-primary">{"★".repeat(r.rating)}</span>}
                      <span>{new Date(r.createdAt).toLocaleDateString("ru")}</span>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80">{r.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
