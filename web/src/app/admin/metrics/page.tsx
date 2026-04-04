import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminMetricsPage() {
  const session = await auth();
  // @ts-expect-error custom
  if (!session || session.user?.role !== "SUPERADMIN") redirect("/admin");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    totalUsers, newUsersThisMonth, newUsersPrevMonth,
    totalPractitioners, activePractitioners,
    totalBookings, bookingsThisMonth, bookingsPrevMonth,
    completedBookings,
    toolSessionsThisMonth, toolSessionsPrevMonth,
    totalRevenue,
  ] = await Promise.all([
    db.user.count({ where: { role: "CLIENT" } }),
    db.user.count({ where: { role: "CLIENT", createdAt: { gte: startOfMonth } } }),
    db.user.count({ where: { role: "CLIENT", createdAt: { gte: startOfPrevMonth, lt: startOfMonth } } }),
    db.practitioner.count(),
    db.practitioner.count({ where: { status: "ACTIVE" } }),
    db.booking.count(),
    db.booking.count({ where: { createdAt: { gte: startOfMonth } } }),
    db.booking.count({ where: { createdAt: { gte: startOfPrevMonth, lt: startOfMonth } } }),
    db.booking.count({ where: { status: "COMPLETED" } }),
    db.toolSession.count({ where: { month: now.toISOString().slice(0, 7) } }),
    db.toolSession.count({ where: { month: startOfPrevMonth.toISOString().slice(0, 7) } }),
    db.booking.aggregate({ _sum: { priceRub: true }, where: { status: "COMPLETED" } }),
  ]);

  const revenueTotal = totalRevenue._sum.priceRub ?? 0;
  const platformRevenue = Math.round(revenueTotal * 0.15);

  function delta(cur: number, prev: number) {
    if (prev === 0) return cur > 0 ? "+∞%" : "0%";
    const d = Math.round(((cur - prev) / prev) * 100);
    return d >= 0 ? `+${d}%` : `${d}%`;
  }

  const metrics = [
    { label: "Клиентов всего",       value: totalUsers,           sub: `+${newUsersThisMonth} этот месяц`,        delta: delta(newUsersThisMonth, newUsersPrevMonth), icon: "👤" },
    { label: "Практиков",            value: activePractitioners,  sub: `из ${totalPractitioners} зарегистрированных`, delta: null,                                   icon: "🔮" },
    { label: "Бронирований",         value: bookingsThisMonth,    sub: `всего ${totalBookings}`,                  delta: delta(bookingsThisMonth, bookingsPrevMonth),  icon: "📅" },
    { label: "Завершено сессий",     value: completedBookings,    sub: "за всё время",                            delta: null,                                        icon: "✅" },
    { label: "Использ. инструментов",value: toolSessionsThisMonth,sub: `предыдущий: ${toolSessionsPrevMonth}`,    delta: delta(toolSessionsThisMonth, toolSessionsPrevMonth), icon: "✦" },
    { label: "Оборот",               value: `${revenueTotal.toLocaleString("ru")} ₽`, sub: `комиссия: ${platformRevenue.toLocaleString("ru")} ₽`, delta: null, icon: "💰" },
  ];

  return (
    <div className="px-6 py-8 max-w-5xl">
      <h1 className="font-heading text-2xl font-bold mb-2">Метрики продукта</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Данные за {now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {metrics.map((m) => (
          <Card key={m.label} className="border-border/40 bg-card/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{m.label}</p>
                <span className="text-xl">{m.icon}</span>
              </div>
              <p className="mt-1 font-heading text-2xl font-bold text-primary">{m.value}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{m.sub}</p>
                {m.delta && (
                  <span className={`text-xs font-medium ${m.delta.startsWith("+") ? "text-green-400" : "text-destructive"}`}>
                    {m.delta}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-border/30 bg-card/20 p-4">
        <p className="text-sm text-muted-foreground">
          📊 Детализированные графики (DAU, MAU, воронка конверсий, LTV) будут добавлены после интеграции с аналитической системой.
        </p>
      </div>
    </div>
  );
}
