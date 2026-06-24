export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDashboardAnalytics, resolveAdminPeriod } from "../admin-analytics-data";
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
} from "../admin-analytics-ui";
import { FinanceExportMenu } from "./export-menu";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminFinanceCenterPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const { totals, charts } = await getDashboardAnalytics(period);
  const reportHref = `/api/admin/finance/management-report?start=${period.startInput}&end=${period.endInput}`;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-finance-center">
      <AdminHero
        eyebrow="финансовый центр"
        title="Финансы платформы"
        actions={
          <>
            <FinanceExportMenu label="Скачать управленческий отчет" baseHref={reportHref} />
            <PeriodToolbar basePath="/admin/finance" start={period.startInput} end={period.endInput} />
          </>
        }
      >
        Управленческий учет, поступления, чеки ЮKassa, выплаты практикам, баллы, сверка и фактическая юнит-экономика.
      </AdminHero>

      <MetricGrid>
        <MetricCard label="Поступления" value={formatRub(totals.revenueRub)} hint="Успешные транзакции" href="/admin/finance/receipts" />
        <MetricCard label="Возвраты" value={formatRub(totals.refundsRub)} hint="Refunded/negative операции" href="/admin/finance/receipts" tone={totals.refundsRub > 0 ? "warn" : "neutral"} />
        <MetricCard label="AI cost" value={formatUsdMicros(totals.aiCostMicros)} hint={`${formatNumber(totals.aiTokens)} токенов`} href="/admin/finance/unit-economics" />
        <MetricCard label="Баллы вручную" value={formatNumber(totals.manualCredits)} hint="Отдельно от купленных баллов" href="/admin/finance/points" />
      </MetricGrid>

      <div className="mt-6 grid gap-4">
        <AnalyticsSection title="Оборот, возвраты и способы оплаты" actionHref="/admin/finance/receipts" actionLabel="Поступления и чеки">
          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
            <VerticalBarChart
              label="Поступления и возвраты по дням"
              unit=" ₽"
              data={charts.revenueByDay.map((point, index) => ({ ...point, secondary: charts.refundsByDay[index]?.value ?? 0 }))}
            />
            <HorizontalBars data={charts.paymentMix} unit=" ₽" />
          </div>
        </AnalyticsSection>

        <AnalyticsSection title="Баллы, цифровые продукты и подписки" actionHref="/admin/finance/points" actionLabel="Баллы">
          <div className="grid gap-4 xl:grid-cols-2">
            <VerticalBarChart label="Дневное изменение баллов" data={charts.creditsByDay} />
            <HorizontalBars data={charts.productUsage} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricCard label="Купленные баллы" value={formatNumber(totals.purchasedCredits)} />
            <MetricCard label="Ручные начисления" value={formatNumber(totals.manualCredits)} />
            <MetricCard label="Активные подписки" value={formatNumber(totals.activeSubscriptions)} />
          </div>
        </AnalyticsSection>

        <AnalyticsSection title="Управление финансами">
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard label="Выплаты практикам" value="Открыть" href="/admin/finance/payouts" hint="Селективные и авто-выплаты" />
            <MetricCard label="Отчеты практиков" value="Открыть" href="/admin/finance/reports" hint="Электронные отчеты услуг" />
            <MetricCard label="Цены и тарифы" value="Открыть" href="/admin/pricing" hint="Продукты, подписки, комиссии" />
            <MetricCard label="Сверка и импорт" value="Открыть" href="/admin/finance/reconciliation" hint="Webhook/экспорт/провайдер" />
            <MetricCard label="Контроль и журналы" value="Открыть" href="/admin/finance/controls" hint="Финансовые логи" />
            <MetricCard label="Юнит-экономика" value="Открыть" href="/admin/finance/unit-economics" hint="Фактические AI-затраты" />
          </div>
        </AnalyticsSection>
      </div>
    </main>
  );
}
