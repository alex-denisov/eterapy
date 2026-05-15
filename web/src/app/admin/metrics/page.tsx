export const dynamic = "force-dynamic";

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
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oneDayAgo = new Date(now);
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const prevMonthStr = startOfPrevMonth.toISOString().slice(0, 7);

  // ─── Today's metrics ───
  const [
    todayRegistrations,
    todayBookings,
    todayCompletedBookingsRevenue,
    activeComplaints,
  ] = await Promise.all([
    db.user.count({ where: { role: "CLIENT", createdAt: { gte: startOfToday, lt: startOfTomorrow } } }),
    db.booking.count({ where: { createdAt: { gte: startOfToday, lt: startOfTomorrow } } }),
    db.booking.aggregate({
      _sum: { priceRub: true },
      where: { status: "COMPLETED", priceRub: { gt: 0 }, updatedAt: { gte: startOfToday } },
    }),
    db.complaint.count({ where: { status: "OPEN" } }),
  ]);

  // ─── DAU / MAU ───
  // Active = users who made any action (booking or tool session) in the period
  const [
    dauClients,
    mauClients,
  ] = await Promise.all([
    // DAU: distinct users active in last 1 day
    (async () => {
      const [bookingUsers, toolUsers] = await Promise.all([
        db.booking.findMany({
          where: { createdAt: { gte: oneDayAgo } },
          select: { clientId: true },
          distinct: ["clientId"],
        }),
        db.toolSession.groupBy({
          by: ["userId"],
          where: { createdAt: { gte: oneDayAgo } },
        }),
      ]);
      const userIds = new Set([
        ...bookingUsers.map((b) => b.clientId),
        ...toolUsers.map((t) => t.userId),
      ]);
      return userIds.size;
    })(),
    // MAU: distinct users active in last 30 days
    (async () => {
      const [bookingUsers, toolUsers] = await Promise.all([
        db.booking.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { clientId: true },
          distinct: ["clientId"],
        }),
        db.toolSession.groupBy({
          by: ["userId"],
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
      ]);
      const userIds = new Set([
        ...bookingUsers.map((b) => b.clientId),
        ...toolUsers.map((t) => t.userId),
      ]);
      return userIds.size;
    })(),
  ]);

  // ─── Base metrics ───
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

  // ─── Conversion funnel ───
  const [
    totalUsersWithToolSessions,
    totalUsersWithBookings,
    totalUsersWithCompletedBookings,
  ] = await Promise.all([
    db.toolSession.groupBy({ by: ["userId"] }).then((r) => r.length),
    db.booking.groupBy({ by: ["clientId"] }).then((r) => r.length),
    db.booking.groupBy({ by: ["clientId"], where: { status: "COMPLETED" } }).then((r) => r.length),
  ]);

  // ─── Average session duration ───
  const videoSessionsWithDuration = await db.videoSession.findMany({
    where: { startedAt: { not: null }, endedAt: { not: null } },
    select: { startedAt: true, endedAt: true },
  });
  let avgSessionMinutes = 0;
  if (videoSessionsWithDuration.length > 0) {
    const totalMinutes = videoSessionsWithDuration.reduce((sum, vs) => {
      const diff = (vs.endedAt!.getTime() - vs.startedAt!.getTime()) / 60000;
      return sum + diff;
    }, 0);
    avgSessionMinutes = Math.round(totalMinutes / videoSessionsWithDuration.length);
  }

  // ─── Revenue by modality ───
  // Use practitioner's PRIMARY (first) specialty to avoid double-counting
  const bookingsWithPractitioner = await db.booking.findMany({
    where: { status: "COMPLETED", priceRub: { gt: 0 } },
    select: {
      priceRub: true,
      practitioner: { select: { specialties: true } },
    },
  });
  const revenueByModality: Record<string, number> = {};
  for (const b of bookingsWithPractitioner) {
    const primarySpec = b.practitioner.specialties[0];
    if (primarySpec) {
      if (!revenueByModality[primarySpec]) revenueByModality[primarySpec] = 0;
      revenueByModality[primarySpec] += b.priceRub;
    }
  }
  const modalityRevenue = Object.entries(revenueByModality)
    .sort(([, a], [, b]) => b - a)
    .map(([modality, revenue]) => ({ modality, revenue }));

  // ─── Churn rate ───
  // Users who used tools in prev month but NOT in current month
  const [prevMonthToolUsers, currentMonthToolUsers] = await Promise.all([
    db.toolSession.groupBy({
      by: ["userId"],
      where: { month: prevMonthStr },
    }),
    db.toolSession.groupBy({
      by: ["userId"],
      where: { month: monthStr },
    }),
  ]);
  const prevMonthUserIds = new Set(prevMonthToolUsers.map((t) => t.userId));
  const currentMonthUserIds = new Set(currentMonthToolUsers.map((t) => t.userId));
  let churnedUsers = 0;
  for (const id of prevMonthUserIds) {
    if (!currentMonthUserIds.has(id)) churnedUsers++;
  }
  const churnRate = prevMonthUserIds.size > 0
    ? Math.round((churnedUsers / prevMonthUserIds.size) * 100)
    : 0;

  const revenueTotal = totalRevenue._sum.priceRub ?? 0;
  const totalBalanceRub = (totalBalance._sum.balance ?? 0) / 100;
  const todayRevenueRub = todayCompletedBookingsRevenue._sum.priceRub ?? 0;

  function delta(cur: number, prev: number) {
    if (prev === 0) return cur > 0 ? { text: "NEW", color: "bg-green-500/10 text-green-400" } : { text: "—", color: "text-muted-foreground/40" };
    const d = Math.round(((cur - prev) / prev) * 100);
    const isUp = d >= 0;
    return { text: isUp ? `+${d}%` : `${d}%`, color: isUp ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400" };
  }

  const funnelSteps = [
    { step: "Зарегистрировались", value: totalClients, icon: "👤" },
    { step: "Использовали AI", value: totalUsersWithToolSessions, icon: "✦" },
    { step: "Забронировали", value: totalUsersWithBookings, icon: "📅" },
    { step: "Завершили сессию", value: totalUsersWithCompletedBookings, icon: "✅" },
  ];

  // Conversion rates
  const regToAiRate = totalClients > 0 ? ((totalUsersWithToolSessions / totalClients) * 100).toFixed(1) : "0";
  const aiToBookingRate = totalUsersWithToolSessions > 0 ? ((totalUsersWithBookings / totalUsersWithToolSessions) * 100).toFixed(1) : "0";
  const bookingCompletionRate = totalUsersWithBookings > 0 ? ((totalUsersWithCompletedBookings / totalUsersWithBookings) * 100).toFixed(1) : "0";

  const newClientsDelta = delta(newClientsThisMonth, newClientsPrevMonth);
  const bookingsDelta = delta(bookingsThisMonth, bookingsPrevMonth);
  const toolDelta = delta(toolSessionsThisMonth, toolSessionsPrevMonth);

  // ─── v5 Activation funnel from AnalyticsEvent ───
  const thirtyDaysAgoDate = new Date(now);
  thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);

  const [
    dialoguesCreated30d,
    answersGenerated30d,
    answersViewed30d,
    specialistRecommended30d,
  ] = await Promise.all([
    db.analyticsEvent.count({ where: { event: "dialogue_created", createdAt: { gte: thirtyDaysAgoDate } } }),
    db.analyticsEvent.count({ where: { event: "primary_answer_generated", createdAt: { gte: thirtyDaysAgoDate } } }),
    db.analyticsEvent.count({ where: { event: "primary_answer_viewed", createdAt: { gte: thirtyDaysAgoDate } } }),
    db.analyticsEvent.count({ where: { event: "specialist_recommended", createdAt: { gte: thirtyDaysAgoDate } } }),
  ]);

  const activationFunnel = [
    { step: "Диалогов создано", value: dialoguesCreated30d, icon: "💬" },
    { step: "Ответов сгенерировано", value: answersGenerated30d, icon: "✦" },
    { step: "Ответов просмотрено", value: answersViewed30d, icon: "👁" },
    { step: "Спец. рекомендовано", value: specialistRecommended30d, icon: "🎯" },
  ];

  const SPECIALTY_LABELS: Record<string, string> = {
    TAROT: "Таро", ASTROLOGY: "Астрология", NUMEROLOGY: "Нумерология",
    PSYCHIC: "Ясновидение", RUNES: "Руны", DREAMS: "Сонник",
  };

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

      {/* Today's metrics — new cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { label: "Регистраций сегодня", value: todayRegistrations, icon: "📝" },
          { label: "Бронирований сегодня", value: todayBookings, icon: "📅" },
          { label: "Доход сегодня", value: `${todayRevenueRub.toLocaleString("ru-RU")} ₽`, icon: "💰" },
          { label: "Активных жалоб", value: activeComplaints, icon: "⚠️" },
        ].map((m) => (
          <Card key={m.label} className="border-primary/10 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">{m.icon}</span>
                <div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="font-heading text-xl font-bold text-primary tabular-nums">{m.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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

      {/* DAU/MAU */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">DAU (за 24ч)</p>
                <p className="font-heading text-3xl font-bold text-primary tabular-nums">{dauClients}</p>
                <p className="text-xs text-muted-foreground mt-1">Активных пользователей</p>
              </div>
              <span className="text-3xl">📊</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">MAU (за 30 дней)</p>
                <p className="font-heading text-3xl font-bold text-primary tabular-nums">{mauClients}</p>
                <p className="text-xs text-muted-foreground mt-1">Активных пользователей</p>
              </div>
              <span className="text-3xl">📈</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* v5 Activation funnel (AnalyticsEvent — 30 дней) */}
      <div className="mb-8">
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold">⚡ Воронка активации v5 (30 дней)</h3>
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">AnalyticsEvent</Badge>
            </div>
            <div className="space-y-3">
              {activationFunnel.map((f, i) => {
                const maxVal = activationFunnel[0].value || 1;
                const pct = Math.min((f.value / maxVal) * 100, 100);
                const convRate = i > 0 && activationFunnel[i - 1].value > 0
                  ? ((f.value / activationFunnel[i - 1].value) * 100).toFixed(1)
                  : null;
                return (
                  <div key={f.step}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{f.icon} {f.step}</span>
                      <div className="flex items-center gap-3">
                        {convRate && (
                          <span className="text-xs text-muted-foreground/60">→ {convRate}%</span>
                        )}
                        <span className="font-semibold tabular-nums">{f.value.toLocaleString("ru-RU")}</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-card overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {activationFunnel[0].value === 0 && (
              <p className="mt-3 text-xs text-muted-foreground/60">
                Данные появятся по мере того, как пользователи начнут взаимодействовать с платформой.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Воронка конверсии */}
      <div className="grid gap-4 lg:grid-cols-2 mb-8">
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">📊 Воронка конверсии</h3>
            <div className="space-y-3">
              {funnelSteps.map((f, i) => {
                const maxVal = funnelSteps[0].value || 1;
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
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Рег → AI: <strong className="text-foreground">{regToAiRate}%</strong></span>
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

      {/* Average session duration + Churn rate */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <h3 className="font-heading text-lg font-semibold mb-2">⏱️ Средняя длительность сессии</h3>
            <p className="font-heading text-3xl font-bold text-primary tabular-nums">
              {avgSessionMinutes} мин
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              На основе {videoSessionsWithDuration.length} завершённых видеосессий
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-5">
            <h3 className="font-heading text-lg font-semibold mb-2">📉 Отток пользователей (Churn)</h3>
            <p className="font-heading text-3xl font-bold tabular-nums text-red-400">{churnRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {churnedUsers} из {prevMonthUserIds.size} не вернулись в этом месяце
            </p>
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

      {/* Revenue by modality + Top 5 tools */}
      <div className="grid gap-4 lg:grid-cols-2 mb-8">
        {/* Revenue by modality */}
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">💰 Доход по направлениям</h3>
            {modalityRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет данных о доходах по направлениям</p>
            ) : (
              <div className="space-y-2">
                {modalityRevenue.map(({ modality, revenue }) => {
                  const maxRev = modalityRevenue[0]?.revenue || 1;
                  const pct = (revenue / maxRev) * 100;
                  return (
                    <div key={modality}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{SPECIALTY_LABELS[modality] ?? modality}</span>
                        <span className="font-semibold tabular-nums">{revenue.toLocaleString("ru-RU")} ₽</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-card overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top 5 tools */}
        <Card className="border-border/40 bg-card/50">
          <CardContent className="p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">🔥 Топ-5 популярных инструментов</h3>
            <div className="space-y-2">
              {toolUsageByType.slice(0, 5).map((t, i) => (
                <div key={t.tool} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5 text-right">#{i + 1}</span>
                    <span>{t.tool}</span>
                  </div>
                  <Badge variant="secondary" className="tabular-nums">{t._count} сессий</Badge>
                </div>
              ))}
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
