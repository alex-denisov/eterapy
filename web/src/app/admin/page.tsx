export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserPermissions } from "@/lib/moderator-permissions";
import {
  getDashboardAnalytics,
  resolveAdminPeriod,
} from "./admin-analytics-data";
import {
  AdminHero,
  AnalyticsSection,
  HorizontalBars,
  MetricCard,
  MetricGrid,
  PeriodToolbar,
  VerticalBarChart,
  formatNumber,
  formatRub,
  formatUsdMicros,
} from "./admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: PageProps) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  const canViewBusiness = role === "SUPERADMIN" || permissions.includes("analytics.view");
  const period = resolveAdminPeriod(await searchParams);
  const analytics = await getDashboardAnalytics(period);
  const { totals, charts } = analytics;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-analytics-dashboard">
      <AdminHero
        eyebrow="рабочий стол"
        title="Обзор платформы"
        actions={<PeriodToolbar basePath="/admin" start={period.startInput} end={period.endInput} />}
      >
        Ежедневный контроль экономики, продукта, практиков, AI-затрат, баллов и операционных рисков.
      </AdminHero>

      <MetricGrid>
        <MetricCard href="#economy" label="Финансы" value={formatRub(totals.revenueRub)} hint={`Возвраты: ${formatRub(totals.refundsRub)}`} />
        <MetricCard href="#product" label="Продукт и клиенты" value={formatNumber(totals.clientsTotal)} hint={`Бронирований за период: ${formatNumber(totals.bookings)}`} />
        <MetricCard href="#ai-system" label="AI и система" value={formatUsdMicros(totals.aiCostMicros)} hint={`${formatNumber(totals.aiTokens)} токенов`} />
        <MetricCard href="#risk" label="Риски и очередь" value={formatNumber(totals.complaintsOpen + totals.applicationsPending + totals.reviewsPending + totals.jobsFailed)} hint="Жалобы, заявки, отзывы, failed jobs" tone={totals.jobsFailed > 0 ? "warn" : "neutral"} />
      </MetricGrid>

      <div className="mt-6 grid gap-4">
        <AnalyticsSection id="economy" title="Экономика и финансы" actionHref="/admin/finance" actionLabel="Открыть финансы">
          {canViewBusiness ? (
            <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
              <VerticalBarChart
                label="Оборот и возвраты по календарным дням"
                unit=" ₽"
                data={charts.revenueByDay.map((point, index) => ({
                  ...point,
                  secondary: charts.refundsByDay[index]?.value ?? 0,
                }))}
              />
              <div className="grid gap-3">
                <MetricCard label="Сессии завершены" value={formatNumber(totals.completedBookings)} hint={`Оборот сессий: ${formatRub(totals.completedBookingsRevenue)}`} />
                <MetricCard label="Активные подписки" value={formatNumber(totals.activeSubscriptions)} hint="Клиентские и продуктовые подписки" />
                <HorizontalBars data={charts.paymentMix} unit=" ₽" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--soft-ink-soft)]">Для просмотра финансовых метрик нужна роль SUPERADMIN или право analytics.view.</p>
          )}
        </AnalyticsSection>

        <AnalyticsSection id="product" title="Продукт, клиенты и баллы" actionHref="/admin/product" actionLabel="Открыть продуктовый центр">
          <div className="grid gap-4 xl:grid-cols-2">
            <VerticalBarChart label="Бронирования по дням" data={charts.bookingsByDay} />
            <VerticalBarChart label="Баллы: дневное изменение баланса" data={charts.creditsByDay} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricCard label="Баллы куплены" value={formatNumber(totals.purchasedCredits)} hint="Источник purchase" />
            <MetricCard label="Баллы начислены вручную" value={formatNumber(totals.manualCredits)} hint="Источник admin, отдельно от покупок" />
            <MetricCard label="Изменение баланса баллов" value={formatNumber(totals.creditsBalanceDelta)} hint="Net ledger за период" />
          </div>
        </AnalyticsSection>

        <AnalyticsSection id="practitioners" title="Практики и capacity" actionHref="/admin/applications" actionLabel="Заявки практиков">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Всего практиков" value={formatNumber(totals.practitionersTotal)} hint={`Активных: ${formatNumber(totals.activePractitioners)}`} />
            <MetricCard label="Заявки / документы" value={formatNumber(totals.applicationsPending)} hint="Ожидают проверки" tone={totals.applicationsPending > 0 ? "warn" : "neutral"} />
            <MetricCard label="Клиенты" value={formatNumber(totals.clientsTotal)} hint={`Всего пользователей: ${formatNumber(totals.usersTotal)}`} />
          </div>
          <div className="mt-4 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4 text-sm text-[var(--soft-ink-soft)]">
            Загрузка практиков считается по фактическим бронированиям в выбранном календарном периоде. Детальная очередь и длительность сессий открываются в разделе сессий.
          </div>
        </AnalyticsSection>

        <AnalyticsSection id="ai-system" title="AI, токены и системная устойчивость" actionHref="/admin/ops" actionLabel="Открыть систему">
          <div className="grid gap-4 xl:grid-cols-2">
            <VerticalBarChart label="AI cost по дням" unit=" μ$" data={charts.aiCostByDay} />
            <VerticalBarChart label="Токены по дням" data={charts.aiTokensByDay} />
          </div>
        </AnalyticsSection>

        <AnalyticsSection id="unit" title="Юнит-экономика продуктов" actionHref="/admin/finance/unit-economics" actionLabel="Открыть юнит-экономику">
          <HorizontalBars data={charts.productUsage} />
        </AnalyticsSection>

        <AnalyticsSection id="risk" title="Риски, качество и дневные приоритеты" actionHref="/admin/product/quality" actionLabel="Открыть очередь контроля">
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Открытые жалобы" value={formatNumber(totals.complaintsOpen)} href="/admin/complaints" tone={totals.complaintsOpen > 0 ? "warn" : "neutral"} />
            <MetricCard label="Отзывы на контроле" value={formatNumber(totals.reviewsPending)} href="/admin/reviews" tone={totals.reviewsPending > 0 ? "warn" : "neutral"} />
            <MetricCard label="Заявки практиков" value={formatNumber(totals.applicationsPending)} href="/admin/applications" tone={totals.applicationsPending > 0 ? "warn" : "neutral"} />
            <MetricCard label="Сбойные задачи" value={formatNumber(totals.jobsFailed)} href="/admin/jobs" tone={totals.jobsFailed > 0 ? "danger" : "neutral"} />
          </div>
        </AnalyticsSection>

        <AnalyticsSection title="Быстрые переходы">
          <div className="grid gap-3 md:grid-cols-3">
            <Link className="soft-admin-action justify-center" href="/admin/finance/receipts">Поступления и чеки</Link>
            <Link className="soft-admin-action justify-center" href="/admin/product/results">Продукты и результаты</Link>
            <Link className="soft-admin-action justify-center" href="/admin/ops/ai-cost">AI-затраты и токены</Link>
          </div>
        </AnalyticsSection>
      </div>
    </main>
  );
}
