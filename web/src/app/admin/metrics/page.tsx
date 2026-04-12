import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminMetricsPage() {
  const session = await auth();
  if (!session || session.user?.role !== "SUPERADMIN") redirect("/admin");

  const now = new Date();
  const monthStr = now.toISOString().slice(0, 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    totalClients, newClientsThisMonth, newClientsPrevMonth,
    totalPractitioners, activePractitioners,
    totalBookings, bookingsThisMonth, bookingsPrevMonth,
    pendingBookings, confirmedBookings, inProgressBookings, completedBookings, cancelledBookings,
    totalToolSessions, toolSessionsThisMonth, toolSessionsPrevMonth,
    quickSessions, fullSessions,
    totalRevenue,
    totalBalance,
    totalComplaints, openComplaints,
    totalReviews, avgRating,
    topPractitioners,
    toolUsageByType,
  ] = await Promise.all([
    db.user.count({ where: { role: "CLIENT" } }),
    db.user.count({ where: { role: "CLIENT", createdAt: { gte: startOfMonth } } }),
    db.user.count({ where: { role: "CLIENT", createdAt: { gte: startOfPrevMonth, lt: startOfMonth } } }),
    db.practitioner.count(),
    db.practitioner.count({ where: { status: "ACTIVE" } }),
    db.booking.count(),
    db.booking.count({ where: { createdAt: { gte: startOfMonth } } }),
    db.booking.count({ where: { createdAt: { gte: startOfPrevMonth, lt: startOfMonth } } }),
    db.booking.count({ where: { status: "PENDING" } }),
    db.booking.count({ where: { status: "CONFIRMED" } }),
    db.booking.count({ where: { status: "IN_PROGRESS" } }),
    db.booking.count({ where: { status: "COMPLETED" } }),
    db.booking.count({ where: { status: "CANCELLED" } }),
    db.toolSession.count(),
    db.toolSession.count({ where: { month: monthStr } }),
    db.toolSession.count({ where: { month: startOfPrevMonth.toISOString().slice(0, 7) } }),
    db.toolSession.count({ where: { tier: "quick" } }),
    db.toolSession.count({ where: { tier: "full" } }),
    db.booking.aggregate({ _sum: { priceRub: true }, where: { status: "COMPLETED", priceRub: { gt: 0 } } }),
    db.user.aggregate({ _sum: { balance: true } }),
    db.complaint.count(),
    db.complaint.count({ where: { status: "OPEN" } }),
    db.review.count(),
    db.review.aggregate({ _avg: { rating: true } }),
    db.practitioner.findMany({
      take: 5,
      orderBy: { sessionCount: "desc" },
      include: { user: { select: { name: true } } },
    }),
    db.toolSession.groupBy({
      by: ["tool"],
      _count: true,
      orderBy: { _count: { tool: "desc" } },
    }),
  ]);

  const revenueTotal = totalRevenue._sum.priceRub ?? 0;
  const totalBalanceRub = (totalBalance._sum.balance ?? 0) / 100;

  function delta(cur: number, prev: number) {
    if (prev === 0) return cur > 0 ? { text: "NEW", color: "bg-green-500/10 text-green-400" } : { text: "—", color: "text-muted-foreground/40" };
    const d = Math.round(((cur - prev) / prev) * 100);
    const isUp = d >= 0;
    return { text: isUp ? `+${d}%` : `${d}%`, color: isUp ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400" };
  }

  const funnel = [
    { step: "Клиентов всего", value: totalClients, icon: "👤" },
    { step: "AI-сессий (всего)", value: totalToolSessions, icon: "✦" },
    { step: "Бронирований (всего)", value: totalBookings, icon: "📅" },
    { step: "Завершённых сессий", value: completedBookings, icon: "✅" },
  ];

  // Conversion rates
  const aiToBookingRate = totalClients > 0 ? ((bookingsThisMonth / Math.max(totalClients, 1)) * 100).toFixed(1) : "0";
  const bookingCompletionRate = totalBookings > 0 ? ((completedBookings / totalBookings) * 100).toFixed(1) : "0";

  const newClientsDelta = delta(newClientsThisMonth, newClientsPrevMonth);
  const bookingsDelta = delta(bookingsThisMonth, bookingsPrevMonth);
  const toolDelta = delta(toolSessionsThisMonth, toolSessionsPrevMonth);

  return (
    <div className="px-6 py-8 max-w-7xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Метрики продукта</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {now.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { label: "Клиентов", value: totalClients, sub: `+${newClientsThisMonth} этот месяц`, d: newClientsDelta, icon: "👤" },
          { label: "Активных практиков", value: activePractitioners, sub: `из ${totalPractitioners}`, d: null, icon: "🔮" },
          { label: "Бронирований (мес)", value: bookingsThisMonth, sub: `всего ${totalBookings}`, d: bookingsDelta, icon: "📅" },
          { label: "Завершено сессий", value: completedBookings, sub: `${bookingCompletionRate}% конверсия`, d: null, icon: "✅" },
        ].map((m) => (
          <Card key={m.label} className="border-border/40 bg-card/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{m.label}</p>
                <span className="text-xl">{m.icon}</span>
              </div>
              <p className="mt-1 font-heading text-2xl font-bold text-primary tabular-nums">{m.value}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{m.sub}</p>
                {m.d && <Badge variant="secondary" className={`text-[10px] ${m.d.color}`}>{m.d.text}</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Воронка конверсии */}
      <div className="grid gap-4 lg:grid-cols-2 mb-8">
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">📊 Воронка конверсии</h3>
            <div className="space-y-3">
              {funnel.map((f, i) => {
                const maxVal = funnel[0].value || 1;
                const pct = Math.min((f.value / maxVal) * 100, 100);
                return (
                  <div key={f.step}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{f.icon} {f.step}</span>
                      <span className="font-semibold tabular-nums">{f.value.toLocaleString("ru-RU")}</span>
                    </div>
                    <div className="h-2 rounded-full bg-card overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span>AI → Бронирование: <strong className="text-foreground">{aiToBookingRate}%</strong></span>
              <span>Бронирование → Завершение: <strong className="text-foreground">{bookingCompletionRate}%</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* Статусы бронирований */}
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">📅 Статусы бронирований</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Ожидает", value: pendingBookings, color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
                { label: "Подтверждено", value: confirmedBookings, color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
                { label: "В процессе", value: inProgressBookings, color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
                { label: "Завершено", value: completedBookings, color: "bg-green-500/10 text-green-400 border-green-500/20" },
                { label: "Отменено", value: cancelledBookings, color: "bg-red-500/10 text-red-400 border-red-500/20" },
              ].map((s) => (
                <div key={s.label} className={`rounded-lg border px-3 py-2 ${s.color}`}>
                  <p className="text-xs">{s.label}</p>
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Финансы + AI + Рейтинг */}
      <div className="grid gap-4 lg:grid-cols-3 mb-8">
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">💰 Финансы</h3>
            <div className="space-y-3">
              {[
                { label: "Оборот (завершённые)", value: `${revenueTotal.toLocaleString("ru-RU")} ₽` },
                { label: "Балансы клиентов", value: `${totalBalanceRub.toLocaleString("ru-RU")} ₽` },
                { label: "Быстрые расклады", value: quickSessions.toLocaleString("ru-RU"), sub: "бесплатно" },
                { label: "Полные расклады", value: fullSessions.toLocaleString("ru-RU"), sub: "платно" },
              ].map((f) => (
                <div key={f.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <div className="text-right">
                    <span className="font-semibold tabular-nums">{f.value}</span>
                    {f.sub && <p className="text-[10px] text-muted-foreground/50">{f.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI-инструменты */}
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">✦ Использование AI</h3>
            <div className="space-y-2">
              {toolUsageByType.map((t) => (
                <div key={t.tool} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t.tool}</span>
                  <Badge variant="secondary" className="tabular-nums">{t._count}</Badge>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border/20 flex justify-between text-xs text-muted-foreground">
              <span>Этот месяц: <strong className="text-foreground">{toolSessionsThisMonth}</strong></span>
              <Badge variant="secondary" className={`text-[10px] ${toolDelta.color}`}>{toolDelta.text}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Жалобы + Рейтинг */}
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">⚠️ Качество</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Средний рейтинг</span>
                <span className="font-semibold text-yellow-400 tabular-nums">★ {(avgRating._avg.rating ?? 0).toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Отзывов всего</span>
                <span className="font-semibold tabular-nums">{totalReviews}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Жалоб открыто</span>
                <Badge variant="secondary" className={openComplaints > 0 ? "bg-red-500/10 text-red-400" : "text-muted-foreground"}>{openComplaints}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Жалоб всего</span>
                <span className="font-semibold tabular-nums">{totalComplaints}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Топ практики */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h3 className="font-heading text-lg font-semibold mb-4">🏆 Топ-5 практиков по сессиям</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {topPractitioners.map((p, i) => (
              <div key={p.user.name} className="rounded-lg border border-border/30 bg-card/30 p-3 text-center">
                <p className="text-lg font-bold text-primary">#{i + 1}</p>
                <p className="text-sm font-medium mt-1 truncate">{p.user.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.sessionCount} сессий</p>
                <p className="text-xs text-yellow-400 mt-0.5">
                  ★ {p.reviewCount > 0 ? (p.ratingSum / p.reviewCount).toFixed(1) : "—"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
