export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBookingStatus } from "@/lib/booking-status";

async function getPractitionerData(userId: string) {
  return db.practitioner.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, email: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 3 },
      slots: {
        where: { available: true, startAt: { gte: new Date() } },
        orderBy: { startAt: "asc" },
        take: 5,
      },
    },
  });
}

const STATUS_LABELS = {
  ACTIVE:    { label: "Активен",       color: "bg-green-500/10 text-green-400" },
  PENDING:   { label: "На проверке",   color: "bg-yellow-500/10 text-yellow-400" },
  SUSPENDED: { label: "Приостановлен", color: "bg-destructive/10 text-destructive" },
  BLOCKED:   { label: "Заблокирован",  color: "bg-destructive/20 text-destructive" },
};

export default async function PractitionerCabinetPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await getPractitionerData(session.user!.id!);
  if (!practitioner) {
    return (
      <div className="px-6 py-8 text-center">
        <h1 className="font-heading text-xl font-bold">Профиль практика не настроен</h1>
        <p className="mt-2 text-muted-foreground text-sm">Обратитесь в поддержку: support@eterapy.com</p>
      </div>
    );
  }

  const rating = practitioner.reviewCount > 0 ? (practitioner.ratingSum / practitioner.reviewCount).toFixed(1) : "—";
  const st = STATUS_LABELS[practitioner.status as keyof typeof STATUS_LABELS] ?? STATUS_LABELS.ACTIVE;

  // Pending bookings
  const pendingBookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, status: "PENDING" },
    include: { client: { select: { name: true, email: true } }, slot: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Confirmed / upcoming sessions
  const upcomingBookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, status: { in: ["CONFIRMED", "IN_PROGRESS"] } },
    include: { client: { select: { name: true, email: true } }, slot: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="max-w-6xl px-4 py-8 sm:px-6">
      {/* Шапка */}
      <div className="mb-6">
        <p className="premium-eyebrow">Кабинет практика</p>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <h1 className="premium-title text-3xl md:text-5xl">Добрый вечер, {practitioner.user.name}</h1>
          <Badge className={st.color}>{st.label}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{practitioner.title}</p>
      </div>

      {/* Статистика */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Рейтинг",       value: rating,                                       sub: `${practitioner.reviewCount} отзывов`,   icon: "01",  href: "/cabinet/practitioner/reviews" },
          { label: "Сессий всего",  value: String(practitioner.sessionCount),             sub: "за всё время",                          icon: "02", href: null },
          { label: "На балансе",    value: "0 ₽",                                         sub: "выплата в разработке",                  icon: "03", href: "/cabinet/practitioner/earnings" },
          { label: "Цена сессии",   value: `${practitioner.pricePerSession.toLocaleString("ru")} ₽`, sub: "изменяется по заявке", icon: "04", href: null },
        ].map((s) => (
          <Card key={s.label} className="soft-card">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <span className="font-heading text-xl text-primary">{s.icon}</span>
              </div>
              <p className="mt-1 font-heading text-2xl font-bold text-primary">{s.value}</p>
              {s.href ? (
                <Link href={s.href} className="mt-0.5 block text-xs text-primary hover:underline">{s.sub} →</Link>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Новые запросы */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">Новые запросы</h2>
            <Link href={appUrl("/cabinet/practitioner/clients")} className="text-sm text-primary hover:underline">Все →</Link>
          </div>
          {pendingBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет новых запросов</p>
          ) : (
            <div className="space-y-2">
              {pendingBookings.map((b) => {
                const durationMinutes = b.slot
                  ? Math.round((new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000)
                  : 60;
                return (
                  <div key={b.id} className="flex items-center justify-between rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{b.client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.slot
                          ? new Date(b.slot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                          : "Время не указано"}
                        {" · "}{durationMinutes} мин
                      </p>
                      <p className="text-xs text-muted-foreground">{b.priceRub.toLocaleString("ru")} ₽</p>
                    </div>
                    <PendingActions bookingId={b.id} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Подтверждённые сессии */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">Подтверждённые</h2>
            <Link href={appUrl("/cabinet/practitioner/clients")} className="text-sm text-primary hover:underline">Все →</Link>
          </div>
          {upcomingBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет подтверждённых сессий</p>
          ) : (
            <div className="space-y-2">
              {upcomingBookings.map((b) => {
                const durationMinutes = b.slot
                  ? Math.round((new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000)
                  : 60;
                const st = getBookingStatus(b.status);
                return (
                  <div key={b.id} className="flex items-center justify-between rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{b.client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.slot
                          ? new Date(b.slot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                          : "Время не указано"}
                        {" · "}{durationMinutes} мин
                      </p>
                      <p className="text-xs text-muted-foreground">{b.priceRub.toLocaleString("ru")} ₽</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={st.color}>{st.label}</Badge>
                      {(b.status === "CONFIRMED" || b.status === "IN_PROGRESS") && (
                        <a href={`/session/${b.id}`} className="text-xs text-green-400 hover:underline">Войти →</a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ближайшие слоты */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">Ближайшие слоты</h2>
            <Link href={appUrl("/cabinet/practitioner/schedule")} className="text-sm text-primary hover:underline">Расписание →</Link>
          </div>
          {practitioner.slots.length === 0 ? (
            <div>
              <p className="text-sm text-muted-foreground">Нет свободных слотов</p>
              <Link href={appUrl("/cabinet/practitioner/schedule")} className="mt-2 inline-block text-sm text-primary hover:underline">
                Добавить слоты →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {practitioner.slots.map((s) => (
                <div key={s.id} className="soft-map-tile flex items-center justify-between px-4 py-2.5">
                  <p className="text-sm">
                    {new Date(s.startAt).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(s.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    {" – "}
                    {new Date(s.endAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Server-side — нельзя использовать useState, делаем placeholder
function PendingActions({ bookingId: _bookingId }: { bookingId: string }) {
  void _bookingId;
  return (
    <span className="text-xs text-yellow-400">Ожидает</span>
  );
}
