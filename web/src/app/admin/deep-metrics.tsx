import db from "@/lib/db";

/**
 * T3: deep product metrics, migrated from the standalone /admin/metrics page
 * into the Обзор business-monitoring center. Rendered entirely in the soft-admin
 * card language (soft-paper cards + soft status pills) so nothing is "flooded"
 * with a solid bright colour that hides its own text.
 */

const SPECIALTY_LABELS: Record<string, string> = {
  TAROT: "Таро", ASTROLOGY: "Астрология", NUMEROLOGY: "Нумерология",
  PSYCHIC: "Ясновидение", RUNES: "Руны", DREAMS: "Сонник",
};

function fmt(value: number) {
  return value.toLocaleString("ru-RU");
}

function deltaTone(cur: number, prev: number): { text: string; tone: "ok" | "warn" | "neutral" } {
  if (prev === 0) return cur > 0 ? { text: "NEW", tone: "ok" } : { text: "—", tone: "neutral" };
  const d = Math.round(((cur - prev) / prev) * 100);
  return { text: d >= 0 ? `+${d}%` : `${d}%`, tone: d >= 0 ? "ok" : "warn" };
}

function SoftSection({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-lg font-semibold text-[var(--soft-bordeaux)]">{title}</h3>
        {badge && <span className="soft-admin-status-pill" data-tone="ok">{badge}</span>}
      </div>
      {children}
    </section>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--soft-surface)]">
      <div className="h-full rounded-full bg-[var(--soft-terracotta)] transition-all" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
    </div>
  );
}

export async function DeepMetrics() {
  const now = new Date();
  const monthStr = now.toISOString().slice(0, 7);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oneDayAgo = new Date(now);
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  const prevMonthStr = startOfPrevMonth.toISOString().slice(0, 7);

  const [dauClients, mauClients] = await Promise.all([
    (async () => {
      const [bookingUsers, toolUsers] = await Promise.all([
        db.booking.findMany({ where: { createdAt: { gte: oneDayAgo } }, select: { clientId: true }, distinct: ["clientId"] }),
        db.toolSession.groupBy({ by: ["userId"], where: { createdAt: { gte: oneDayAgo } } }),
      ]);
      return new Set([...bookingUsers.map((b) => b.clientId), ...toolUsers.map((t) => t.userId)]).size;
    })(),
    (async () => {
      const [bookingUsers, toolUsers] = await Promise.all([
        db.booking.findMany({ where: { createdAt: { gte: thirtyDaysAgo } }, select: { clientId: true }, distinct: ["clientId"] }),
        db.toolSession.groupBy({ by: ["userId"], where: { createdAt: { gte: thirtyDaysAgo } } }),
      ]);
      return new Set([...bookingUsers.map((b) => b.clientId), ...toolUsers.map((t) => t.userId)]).size;
    })(),
  ]);

  const [
    totalClients,
    toolSessionsThisMonth, toolSessionsPrevMonth,
    quickSessions, fullSessions,
    pendingBookings, confirmedBookings, inProgressBookings, completedBookings, cancelledBookings,
    totalReviews, avgRating,
    topPractitioners,
    toolUsageByType,
    totalUsersWithToolSessions, totalUsersWithBookings, totalUsersWithCompletedBookings,
  ] = await Promise.all([
    db.user.count({ where: { role: "CLIENT" } }),
    db.toolSession.count({ where: { month: monthStr } }),
    db.toolSession.count({ where: { month: prevMonthStr } }),
    db.toolSession.count({ where: { tier: "quick" } }),
    db.toolSession.count({ where: { tier: "full" } }),
    db.booking.count({ where: { status: "PENDING" } }),
    db.booking.count({ where: { status: "CONFIRMED" } }),
    db.booking.count({ where: { status: "IN_PROGRESS" } }),
    db.booking.count({ where: { status: "COMPLETED" } }),
    db.booking.count({ where: { status: "CANCELLED" } }),
    db.review.count(),
    db.review.aggregate({ _avg: { rating: true } }),
    // Баг 11: top practitioners by REAL conducted sessions (COMPLETED bookings
    // from the DB), not the denormalized practitioner.sessionCount counter that
    // drifted out of sync and summed higher than total bookings.
    db.booking
      .groupBy({
        by: ["practitionerId"],
        where: { status: "COMPLETED" },
        _count: { _all: true },
        orderBy: { _count: { practitionerId: "desc" } },
        take: 5,
      })
      .then(async (groups) => {
        if (groups.length === 0) return [];
        const ids = groups.map((g) => g.practitionerId);
        const pracs = await db.practitioner.findMany({
          where: { id: { in: ids } },
          select: { id: true, user: { select: { name: true } } },
        });
        const byId = new Map(pracs.map((p) => [p.id, p]));
        return groups.map((g) => ({
          id: g.practitionerId,
          user: { name: byId.get(g.practitionerId)?.user.name ?? "—" },
          sessionCount: g._count._all,
        }));
      }),
    db.toolSession.groupBy({ by: ["tool"], _count: true, orderBy: { _count: { tool: "desc" } } }),
    db.toolSession.groupBy({ by: ["userId"] }).then((r) => r.length),
    db.booking.groupBy({ by: ["clientId"] }).then((r) => r.length),
    db.booking.groupBy({ by: ["clientId"], where: { status: "COMPLETED" } }).then((r) => r.length),
  ]);

  // Average video-session duration
  const videoSessions = await db.videoSession.findMany({
    where: { startedAt: { not: null }, endedAt: { not: null } },
    select: { startedAt: true, endedAt: true },
  });
  let avgSessionMinutes = 0;
  if (videoSessions.length > 0) {
    const totalMinutes = videoSessions.reduce((sum, vs) => sum + (vs.endedAt!.getTime() - vs.startedAt!.getTime()) / 60000, 0);
    avgSessionMinutes = Math.round(totalMinutes / videoSessions.length);
  }

  // Revenue by primary modality
  const bookingsWithPractitioner = await db.booking.findMany({
    where: { status: "COMPLETED", priceRub: { gt: 0 } },
    select: { priceRub: true, practitioner: { select: { specialties: true } } },
  });
  const revenueByModality: Record<string, number> = {};
  for (const b of bookingsWithPractitioner) {
    const primary = b.practitioner.specialties[0];
    if (primary) revenueByModality[primary] = (revenueByModality[primary] ?? 0) + b.priceRub;
  }
  const modalityRevenue = Object.entries(revenueByModality)
    .sort(([, a], [, b]) => b - a)
    .map(([modality, revenue]) => ({ modality, revenue }));

  // Churn (tool users present last month, absent this month)
  const [prevMonthToolUsers, currentMonthToolUsers] = await Promise.all([
    db.toolSession.groupBy({ by: ["userId"], where: { month: prevMonthStr } }),
    db.toolSession.groupBy({ by: ["userId"], where: { month: monthStr } }),
  ]);
  const prevIds = new Set(prevMonthToolUsers.map((t) => t.userId));
  const curIds = new Set(currentMonthToolUsers.map((t) => t.userId));
  let churned = 0;
  for (const id of prevIds) if (!curIds.has(id)) churned++;
  const churnRate = prevIds.size > 0 ? Math.round((churned / prevIds.size) * 100) : 0;

  const toolDelta = deltaTone(toolSessionsThisMonth, toolSessionsPrevMonth);

  const funnelSteps = [
    { step: "Зарегистрировались", value: totalClients },
    { step: "Использовали AI", value: totalUsersWithToolSessions },
    { step: "Забронировали", value: totalUsersWithBookings },
    { step: "Завершили сессию", value: totalUsersWithCompletedBookings },
  ];

  const bookingStatuses: Array<{ label: string; value: number; tone: "warn" | "ok" | "neutral" | "danger" }> = [
    { label: "Ожидает", value: pendingBookings, tone: "warn" },
    { label: "Подтверждено", value: confirmedBookings, tone: "neutral" },
    { label: "В процессе", value: inProgressBookings, tone: "neutral" },
    { label: "Завершено", value: completedBookings, tone: "ok" },
    { label: "Отменено", value: cancelledBookings, tone: "danger" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "DAU (24ч)", value: fmt(dauClients), hint: "активных пользователей" },
          { label: "MAU (30 дней)", value: fmt(mauClients), hint: "активных пользователей" },
          { label: "Средняя сессия", value: `${avgSessionMinutes} мин`, hint: `${videoSessions.length} видеосессий` },
          { label: "Отток (churn)", value: `${churnRate}%`, hint: `${churned} из ${prevIds.size} не вернулись` },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--soft-ink-faint)]">{m.label}</p>
            <p className="mt-2 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">{m.value}</p>
            <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">{m.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SoftSection title="Воронка конверсии">
          <div className="space-y-3">
            {funnelSteps.map((f) => {
              const maxVal = funnelSteps[0].value || 1;
              return (
                <div key={f.step}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-[var(--soft-ink-soft)]">{f.step}</span>
                    <span className="font-semibold tabular-nums text-[var(--soft-ink)]">{fmt(f.value)}</span>
                  </div>
                  <Bar pct={(f.value / maxVal) * 100} />
                </div>
              );
            })}
          </div>
        </SoftSection>

        <SoftSection title="Статусы бронирований">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {bookingStatuses.map((s) => (
              <div key={s.label} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/55 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-[var(--soft-ink-soft)]">{s.label}</p>
                  <span className="soft-admin-status-pill" data-tone={s.tone === "neutral" ? "ok" : s.tone}>{fmt(s.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </SoftSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SoftSection title="Финансы и расклады">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--soft-ink-soft)]">Быстрые расклады</span><span className="font-semibold tabular-nums">{fmt(quickSessions)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--soft-ink-soft)]">Полные расклады</span><span className="font-semibold tabular-nums">{fmt(fullSessions)}</span></div>
            <div className="flex items-center justify-between pt-2"><span className="text-[var(--soft-ink-soft)]">AI-сессии за месяц</span><span className="soft-admin-status-pill" data-tone={toolDelta.tone === "neutral" ? "ok" : toolDelta.tone}>{toolDelta.text}</span></div>
          </div>
        </SoftSection>

        <SoftSection title="Использование AI">
          <div className="space-y-2 text-sm">
            {toolUsageByType.length === 0 ? (
              <p className="text-[var(--soft-ink-faint)]">Нет данных</p>
            ) : toolUsageByType.slice(0, 6).map((t) => (
              <div key={t.tool} className="flex items-center justify-between">
                <span className="text-[var(--soft-ink-soft)]">{t.tool}</span>
                <span className="soft-admin-status-pill">{fmt(typeof t._count === "number" ? t._count : 0)}</span>
              </div>
            ))}
          </div>
        </SoftSection>

        <SoftSection title="Качество">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-[var(--soft-ink-soft)]">Средний рейтинг</span><span className="font-semibold tabular-nums text-[var(--soft-bordeaux)]">★ {(avgRating._avg.rating ?? 0).toFixed(1)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--soft-ink-soft)]">Отзывов всего</span><span className="font-semibold tabular-nums">{fmt(totalReviews)}</span></div>
          </div>
        </SoftSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SoftSection title="Доход по направлениям">
          {modalityRevenue.length === 0 ? (
            <p className="text-sm text-[var(--soft-ink-faint)]">Нет данных о доходах по направлениям</p>
          ) : (
            <div className="space-y-2">
              {modalityRevenue.map(({ modality, revenue }) => {
                const maxRev = modalityRevenue[0]?.revenue || 1;
                return (
                  <div key={modality}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-[var(--soft-ink-soft)]">{SPECIALTY_LABELS[modality] ?? modality}</span>
                      <span className="font-semibold tabular-nums">{fmt(revenue)} ₽</span>
                    </div>
                    <Bar pct={(revenue / maxRev) * 100} />
                  </div>
                );
              })}
            </div>
          )}
        </SoftSection>

        <SoftSection title="Топ-5 практиков по сессиям">
          {topPractitioners.length === 0 ? (
            <p className="text-sm text-[var(--soft-ink-faint)]">Нет данных</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {topPractitioners.map((p, i) => (
                <div key={p.id} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/55 p-3 text-center">
                  <p className="font-heading text-lg font-bold text-[var(--soft-bordeaux)]">#{i + 1}</p>
                  <p className="mt-1 truncate text-sm font-medium">{p.user.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">{p.sessionCount} сессий</p>
                </div>
              ))}
            </div>
          )}
        </SoftSection>
      </div>
    </div>
  );
}
