export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUnitEconomicsData, productLabel, resolveAdminPeriod } from "../../admin-analytics-data";
import { adminCurrencyUnit, formatAdminAiCost, formatAdminCurrencyNumber, formatCbrRateLabel, getAdminCurrencyRates, microsUsdToDisplayCurrency, resolveAdminCurrency } from "../../admin-currency";
import { AdminCurrencySelector } from "../../admin-currency-selector";
import { AdminHero, AnalyticsSection, PeriodToolbar, VerticalBarChart } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnitEconomicsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const currency = resolveAdminCurrency(params);
  const [rows, currencyRates] = await Promise.all([
    getUnitEconomicsData(period),
    getAdminCurrencyRates(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-unit-economics">
      <AdminHero
        eyebrow="финансы"
        title="Юнит-экономика"
        actions={<><AdminCurrencySelector basePath="/admin/finance/unit-economics" currency={currency} rateLabel={formatCbrRateLabel(currencyRates)} /><PeriodToolbar basePath="/admin/finance/unit-economics" start={period.startInput} end={period.endInput} /></>}
      >
        Фактические затраты платформы на оказание услуг считаются по AIRequest. Для каждой услуги показана отдельная дневная гистограмма.
      </AdminHero>
      <div className="grid gap-4">
        {rows.length === 0 ? (
          <AnalyticsSection title="Нет AI-затрат за период">Нет данных за выбранный период.</AnalyticsSection>
        ) : rows.map((row) => (
          <AnalyticsSection key={row.feature} title={`${productLabel(row.feature)} · ${formatAdminAiCost(row.totalMicros, currencyRates, currency)}`}>
            <VerticalBarChart
              label="Фактические AI-затраты по дням"
              unit={adminCurrencyUnit(currency)}
              data={row.chart.map((point) => ({ ...point, value: microsUsdToDisplayCurrency(point.value, currency, currencyRates) ?? 0 }))}
              valueFormatter={(value) => formatAdminCurrencyNumber(value, currency)}
            />
          </AnalyticsSection>
        ))}
      </div>
    </main>
  );
}
