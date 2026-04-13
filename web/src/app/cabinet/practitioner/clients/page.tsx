export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBookingStatus } from "@/lib/booking-status";
import { BookingActions } from "./booking-actions";

export default async function PractitionerClientsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({ where: { userId: session.user!.id } });
  if (!practitioner) redirect("/cabinet/practitioner");

  const bookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true, email: true } },
      slot: true,
    },
  });

  const pending = bookings.filter(b => b.status === "PENDING");
  const confirmed = bookings.filter(b => b.status === "CONFIRMED");
  const rest = bookings.filter(b => !["PENDING", "CONFIRMED"].includes(b.status));

  return (
    <div className="px-6 py-8 max-w-3xl">
      <h1 className="font-heading text-2xl font-bold mb-6">Клиенты и записи</h1>

      {bookings.length === 0 && (
        <p className="text-muted-foreground text-sm">Пока нет записей от клиентов.</p>
      )}

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Новые запросы ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((b) => {
              const durationMinutes = b.slot
                ? (new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000
                : 60;
              return (
                <Card key={b.id} className="border-yellow-500/20 bg-yellow-500/5">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{b.client.name}</p>
                        <p className="text-xs text-muted-foreground">{b.client.email}</p>
                        {b.slot && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            📅 {new Date(b.slot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                        <p className="mt-1 text-sm font-medium text-primary">{b.priceRub.toLocaleString("ru")} ₽</p>
                      </div>
                      <BookingActions
                        bookingId={b.id}
                        status={b.status}
                        sessionStartedAt={b.startedAt?.toISOString() ?? b.slot?.startAt.toISOString()}
                        durationMinutes={durationMinutes}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {confirmed.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Подтверждённые</h2>
          <div className="space-y-2">
            {confirmed.map((b) => {
              const durationMinutes = b.slot
                ? (new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000
                : 60;
              return (
                <div key={b.id} className="flex items-center justify-between rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{b.client.name}</p>
                    {b.slot && <p className="text-xs text-muted-foreground">
                      {new Date(b.slot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>}
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <a href={`/session/${b.id}`}
                      className="text-xs text-green-400 hover:text-green-300 transition-colors hover:underline">
                      Видеочат →
                    </a>
                    <p className="text-sm text-primary">{b.priceRub.toLocaleString("ru")} ₽</p>
                    <BookingActions
                      bookingId={b.id}
                      compact
                      status={b.status}
                      sessionStartedAt={b.startedAt?.toISOString() ?? b.slot?.startAt.toISOString()}
                      durationMinutes={durationMinutes}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">История</h2>
          <div className="space-y-1.5">
            {rest.map((b) => {
              const st = getBookingStatus(b.status);
              const durationMinutes = b.slot
                ? Math.round((new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime()) / 60000)
                : 60;
              return (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-card/10 px-4 py-2.5">
                  <div>
                    <p className="text-sm">{b.client.name}</p>
                    {b.slot && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(b.slot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" · "}{durationMinutes} мин
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{b.priceRub.toLocaleString("ru")} ₽</span>
                    <Badge className={st.color}>{st.label}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
