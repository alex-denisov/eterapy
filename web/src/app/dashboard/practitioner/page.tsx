import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PractitionerSignOutButton } from "./signout-button";
import { BookingsList } from "@/components/bookings-list";
import { SlotManagerWrapper } from "./slot-manager-wrapper";

async function getPractitionerData(userId: string) {
  return db.practitioner.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, email: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 3 },
      slots: { where: { available: true, startAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 5 },
    },
  });
}

const STATUS_LABELS = {
  ACTIVE:    { label: "Активен",        color: "bg-green-500/10 text-green-400" },
  PENDING:   { label: "На проверке",    color: "bg-yellow-500/10 text-yellow-400" },
  SUSPENDED: { label: "Приостановлен",  color: "bg-destructive/10 text-destructive" },
  BLOCKED:   { label: "Заблокирован",   color: "bg-destructive/20 text-destructive" },
};

export default async function PractitionerDashboardPage() {
  const session = await auth();
  // @ts-expect-error custom
  if (!session || session.user?.role !== "PRACTITIONER") redirect("/dashboard");

  const practitioner = await getPractitionerData(session.user!.id!);
  if (!practitioner) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-2xl">⚠️</p>
        <h1 className="mt-4 font-heading text-xl font-bold">Профиль практика не настроен</h1>
        <p className="mt-2 text-muted-foreground">Обратитесь в поддержку: support@eterapy.com</p>
      </div>
    );
  }

  const rating = practitioner.reviewCount > 0 ? practitioner.ratingSum / practitioner.reviewCount : 0;
  const st = STATUS_LABELS[practitioner.status as keyof typeof STATUS_LABELS] ?? STATUS_LABELS.ACTIVE;
  const profileUrl = `/practitioners/${practitioner.id}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Шапка */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold">{practitioner.user.name}</h1>
            <Badge className={st.color}>{st.label}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{practitioner.title}</p>
        </div>
        <div className="flex gap-2">
          <Link href={profileUrl} target="_blank"
            className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Мой профиль ↗
          </Link>
          <Link href="/dashboard/settings"
            className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Настройки
          </Link>
          <PractitionerSignOutButton />
        </div>
      </div>

      {/* Статистика */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Рейтинг", value: rating.toFixed(1), sub: `${practitioner.reviewCount} отзывов`, icon: "★" },
          { label: "Сессий всего", value: practitioner.sessionCount, sub: "за всё время", icon: "📅" },
          { label: "На балансе", value: "0 ₽", sub: "выплата скоро", icon: "💰" },
          { label: "Цена сессии", value: `${practitioner.pricePerSession.toLocaleString("ru")} ₽`, sub: "изменяется по заявке", icon: "🎫" },
        ].map((s) => (
          <Card key={s.label} className="border-border/40 bg-card/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <span className="text-xl">{s.icon}</span>
              </div>
              <p className="mt-1 font-heading text-2xl font-bold text-primary">{s.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Запросы на сессии */}
        <div>
          <h2 className="mb-4 font-heading text-lg font-semibold">Запросы на сессии</h2>
          <BookingsList role="practitioner" />
        </div>

        {/* Последние отзывы */}
        <div>
          <h2 className="mb-4 font-heading text-lg font-semibold">Последние отзывы</h2>
          {practitioner.reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет отзывов.</p>
          ) : (
            <div className="space-y-3">
              {practitioner.reviews.map((r) => (
                <Card key={r.id} className="border-border/30 bg-card/30">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Клиент</span>
                      <span className="text-primary text-sm">{"★".repeat(r.rating)}</span>
                    </div>
                    {r.text && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{r.text}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Расписание */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Расписание слотов</h2>
          <span className="text-sm text-muted-foreground">
            Свободных слотов: {practitioner.slots.length}
          </span>
        </div>
        <SlotManagerWrapper practitionerId={practitioner.id} />
      </div>
    </div>
  );
}
