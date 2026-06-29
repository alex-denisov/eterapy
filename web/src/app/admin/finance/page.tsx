export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDashboardAnalytics, resolveAdminPeriod } from "../admin-analytics-data";
import { adminCurrencyUnit, formatAdminAiCost, formatAdminCurrencyNumber, formatAdminRub, formatCbrRateLabel, getAdminCurrencyRates, microsUsdToDisplayCurrency, resolveAdminCurrency, rubToDisplayCurrency } from "../admin-currency";
import { AdminCurrencySelector } from "../admin-currency-selector";
import {
  AdminHero,
  AnalyticsSection,
  HorizontalBars,
  MetricCard,
  MetricGrid,
  PeriodToolbar,
  VerticalBarChart,
  formatNumber,
} from "../admin-analytics-ui";
import { FinanceExportMenu } from "./export-menu";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminFinanceCenterPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const currency = resolveAdminCurrency(params);
  const [{ totals, charts }, currencyRates] = await Promise.all([
    getDashboardAnalytics(period),
    getAdminCurrencyRates(),
  ]);
  const reportHref = `/api/admin/finance/management-report?start=${period.startInput}&end=${period.endInput}`;
  const aiCostByDay = charts.aiCostByDay.map((point) => ({ ...point, value: microsUsdToDisplayCurrency(point.value, currency, currencyRates) ?? 0 }));
  const revenueByDay = charts.revenueByDay.map((point) => ({ ...point, value: rubToDisplayCurrency(point.value, currency, currencyRates) ?? 0 }));
  const refundsByDay = charts.refundsByDay.map((point) => ({ ...point, value: rubToDisplayCurrency(point.value, currency, currencyRates) ?? 0 }));
  const paymentMix = charts.paymentMix.map((point) => ({ ...point, value: rubToDisplayCurrency(point.value, currency, currencyRates) ?? 0 }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-finance-center">
      <AdminHero
        eyebrow="финансовый центр"
        title="Финансы платформы"
        actions={
          <>
            <FinanceExportMenu label="Скачать управленческий отчет" baseHref={reportHref} />
            <AdminCurrencySelector basePath="/admin/finance" currency={currency} rateLabel={formatCbrRateLabel(currencyRates)} />
            <PeriodToolbar basePath="/admin/finance" start={period.startInput} end={period.endInput} />
          </>
        }
      >
        Управленческий учет, поступления, чеки ЮKassa, выплаты практикам, баллы, сверка и фактическая юнит-экономика.
      </AdminHero>
      <MetricGrid>
        <MetricCard label="Поступления" value={formatAdminRub(totals.revenueRub, currency, currencyRates)} hint="Успешные транзакции" href="/admin/finance/receipts" />
        <MetricCard label="Возвраты" value={formatAdminRub(totals.refundsRub, currency, currencyRates)} hint="Возвращенные и отрицательные операции" href="/admin/finance/receipts" tone={totals.refundsRub > 0 ? "warn" : "neutral"} />
        <MetricCard label="AI-затраты" value={formatAdminAiCost(totals.aiCostMicros, currencyRates, currency)} hint={`${formatNumber(totals.aiTokens)} токенов`} href="/admin/finance/unit-economics" />
        <MetricCard label="Баллы вручную" value={formatNumber(totals.manualCredits)} hint="Отдельно от купленных баллов" href="/admin/finance/points" />
      </MetricGrid>

      <div className="mt-6 grid gap-4">
        <AnalyticsSection title="Оборот, возвраты и способы оплаты" actionHref="/admin/finance/receipts" actionLabel="Поступления и чеки">
          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
            <VerticalBarChart
              label="Поступления и возвраты по дням"
              unit={adminCurrencyUnit(currency)}
              data={revenueByDay.map((point, index) => ({ ...point, secondary: refundsByDay[index]?.value ?? 0 }))}
              seriesLabels={["Поступления", "Возвраты"]}
              valueFormatter={(value) => formatAdminCurrencyNumber(value, currency)}
            />
            <HorizontalBars data={paymentMix} unit={adminCurrencyUnit(currency)} />
          </div>
        </AnalyticsSection>

        <AnalyticsSection title="AI-затраты" actionHref="/admin/finance/unit-economics" actionLabel="Юнит-экономика">
          <VerticalBarChart
            label="Фактические AI-затраты по дням"
            unit={adminCurrencyUnit(currency)}
            data={aiCostByDay}
            valueFormatter={(value) => formatAdminCurrencyNumber(value, currency)}
          />
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
