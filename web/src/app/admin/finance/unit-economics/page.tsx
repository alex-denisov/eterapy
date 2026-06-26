export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUnitEconomicsData, productLabel, resolveAdminPeriod } from "../../admin-analytics-data";
import { formatAdminAiCostRub, formatCbrRateLabel, getAdminCurrencyRates, microsUsdToRub } from "../../admin-currency";
import { AdminHero, AnalyticsSection, PeriodToolbar, VerticalBarChart, formatCompactRub } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnitEconomicsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const [rows, currencyRates] = await Promise.all([
    getUnitEconomicsData(period),
    getAdminCurrencyRates(period.end),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-unit-economics">
      <AdminHero
        eyebrow="финансы"
        title="Юнит-экономика"
        actions={<PeriodToolbar basePath="/admin/finance/unit-economics" start={period.startInput} end={period.endInput} />}
      >
        Фактические затраты платформы на оказание услуг считаются по AIRequest. Для каждой услуги показана отдельная дневная гистограмма.
      </AdminHero>
      <div className="grid gap-4">
        {rows.length === 0 ? (
          <AnalyticsSection title="Нет AI-затрат за период">Нет данных за выбранный период.</AnalyticsSection>
        ) : rows.map((row) => (
          <AnalyticsSection key={row.feature} title={`${productLabel(row.feature)} · ${formatAdminAiCostRub(row.totalMicros, currencyRates)}`}>
            <VerticalBarChart
              label={`Фактические AI-затраты по дням · ${formatCbrRateLabel(currencyRates)}`}
              unit=" ₽"
              data={row.chart.map((point) => ({ ...point, value: microsUsdToRub(point.value, currencyRates) ?? 0 }))}
              valueFormatter={(value) => `${formatCompactRub(value)} ₽`}
            />
          </AnalyticsSection>
        ))}
      </div>
    </main>
  );
}
