import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookingStatus } from "@prisma/client";

const STATUS_LABELS: Record<BookingStatus, { label: string; color: string }> = {
  PENDING:     { label: "Ожидает",       color: "bg-yellow-500/10 text-yellow-400" },
  CONFIRMED:   { label: "Подтверждено",  color: "bg-green-500/10 text-green-400" },
  IN_PROGRESS: { label: "Идёт сессия",   color: "bg-blue-500/10 text-blue-400" },
  COMPLETED:   { label: "Завершено",     color: "bg-primary/10 text-primary" },
  CANCELLED:   { label: "Отменено",      color: "bg-muted/40 text-muted-foreground" },
  DISPUTED:    { label: "Спор",          color: "bg-destructive/10 text-destructive" },
  REFUNDED:    { label: "Возврат",       color: "bg-muted/40 text-muted-foreground" },
};

export default async function ClientBookingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const bookings = await db.booking.findMany({
    where: { clientId: session.user!.id },
    orderBy: { createdAt: "desc" },
    include: {
      practitioner: { include: { user: { select: { name: true, email: true } } } },
      slot: true,
    },
  });

  const grouped = {
    upcoming: bookings.filter(b => ["PENDING", "CONFIRMED"].includes(b.status)),
    past: bookings.filter(b => ["COMPLETED", "CANCELLED", "DISPUTED"].includes(b.status)),
  };

  return (
    <div className="px-6 py-8 max-w-3xl">
      <h1 className="font-heading text-2xl font-bold mb-6">Мои записи</h1>

      {bookings.length === 0 && (
        <div className="rounded-xl border border-border/30 bg-card/20 py-12 text-center">
          <p className="text-muted-foreground">Пока нет записей к практикам</p>
          <Link href="/practitioners" className="mt-4 inline-block text-sm text-primary hover:underline">
            Найти практика →
          </Link>
        </div>
      )}

      {grouped.upcoming.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Предстоящие</h2>
          <div className="space-y-3">
            {grouped.upcoming.map(b => {
              const st = STATUS_LABELS[b.status as BookingStatus];
              return (
                <Card key={b.id} className="border-border/40 bg-card/40">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{b.practitioner.user.name}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {b.slot ? new Date(b.slot.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Время не выбрано"}
                      </p>
                      <p className="text-sm font-medium text-primary mt-1">{b.priceRub.toLocaleString("ru")} ₽</p>
                    </div>
                    <Badge className={st.color}>{st.label}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {grouped.past.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">История</h2>
          <div className="space-y-2">
            {grouped.past.map(b => {
              const st = STATUS_LABELS[b.status as BookingStatus];
              return (
                <div key={b.id} className="flex items-center justify-between rounded-xl border border-border/20 bg-card/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{b.practitioner.user.name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString("ru-RU")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-primary">{b.priceRub.toLocaleString("ru")} ₽</p>
                    <span className={`text-xs ${st.color.split(" ")[1]}`}>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
