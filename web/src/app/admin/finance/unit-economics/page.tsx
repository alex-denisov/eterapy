export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUnitEconomicsData, productLabel, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, AnalyticsSection, PeriodToolbar, VerticalBarChart, formatUsdMicros } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnitEconomicsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const rows = await getUnitEconomicsData(period);

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
          <AnalyticsSection key={row.feature} title={`${productLabel(row.feature)} · ${formatUsdMicros(row.totalMicros)}`}>
            <VerticalBarChart label="Фактические деньги, потраченные платформой по дням" unit=" μ$" data={row.chart} />
          </AnalyticsSection>
        ))}
      </div>
    </main>
  );
}
