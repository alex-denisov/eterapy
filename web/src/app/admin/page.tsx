import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PractitionerStatus, BookingStatus } from "@prisma/client";
import { AdminActions } from "./admin-actions";

async function getStats() {
  const [totalUsers, totalPractitioners, pendingPractitioners, totalBookings, pendingBookings] = await Promise.all([
    db.user.count(),
    db.practitioner.count(),
    db.practitioner.count({ where: { status: PractitionerStatus.PENDING } }),
    db.booking.count(),
    db.booking.count({ where: { status: BookingStatus.PENDING } }),
  ]);

  const recentBookings = await db.booking.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true, email: true } },
      practitioner: { include: { user: { select: { name: true } } } },
    },
  });

  const pendingPractitionersList = await db.practitioner.findMany({
    where: { status: PractitionerStatus.PENDING },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  return { totalUsers, totalPractitioners, pendingPractitioners, totalBookings, pendingBookings, recentBookings, pendingPractitionersList };
}

export default async function AdminPage() {
  const session = await auth();
  // @ts-expect-error custom
  const role = session?.user?.role;
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/");

  const stats = await getStats();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold">Обзор</h1>
        <p className="mt-1 text-sm text-muted-foreground">ETerapy · Панель администратора</p>
      </div>

      {/* Статистика */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Пользователей", value: stats.totalUsers, icon: "👤", color: "text-primary" },
          { label: "Практиков", value: stats.totalPractitioners, icon: "🔮", color: "text-primary" },
          { label: "На проверке", value: stats.pendingPractitioners, icon: "⏳", color: stats.pendingPractitioners > 0 ? "text-yellow-400" : "text-primary" },
          { label: "Бронирований", value: stats.totalBookings, icon: "📅", color: "text-primary" },
          { label: "Ожидают", value: stats.pendingBookings, icon: "🕐", color: stats.pendingBookings > 0 ? "text-yellow-400" : "text-primary" },
        ].map((s) => (
          <Card key={s.label} className="border-border/40 bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <span className="text-lg">{s.icon}</span>
              </div>
              <p className={`mt-1 font-heading text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Практики на проверке */}
        <div>
          <h2 className="mb-4 font-heading text-lg font-semibold">
            Практики на проверке
            {stats.pendingPractitioners > 0 && (
              <Badge variant="secondary" className="ml-2 bg-yellow-500/10 text-yellow-400 text-xs">
                {stats.pendingPractitioners}
              </Badge>
            )}
          </h2>
          {stats.pendingPractitionersList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет заявок на проверке</p>
          ) : (
            <div className="space-y-3">
              {stats.pendingPractitionersList.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                  <div>
                    <p className="font-medium">{p.user.name}</p>
                    <p className="text-xs text-muted-foreground">{p.user.email} · {p.title}</p>
                  </div>
                  <AdminActions practitionerId={p.id} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Последние бронирования */}
        <div>
          <h2 className="mb-4 font-heading text-lg font-semibold">Последние бронирования</h2>
          {stats.recentBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет бронирований</p>
          ) : (
            <div className="space-y-2">
              {stats.recentBookings.map((b) => {
                const statusColors: Record<string, string> = {
                  PENDING: "text-yellow-400", CONFIRMED: "text-green-400",
                  COMPLETED: "text-primary", CANCELLED: "text-muted-foreground",
                  DISPUTED: "text-destructive",
                };
                return (
                  <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/30 bg-card/30 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.client.name} → {b.practitioner.user.name}</p>
                      <p className="text-xs text-muted-foreground">{b.priceRub.toLocaleString("ru")} ₽ · {new Date(b.createdAt).toLocaleDateString("ru-RU")}</p>
                    </div>
                    <span className={`ml-3 shrink-0 text-xs font-medium ${statusColors[b.status] ?? "text-muted-foreground"}`}>
                      {b.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
