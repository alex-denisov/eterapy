export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getDashboardAnalytics, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, DataTable, MetricCard, MetricGrid, PeriodToolbar, StatusBadge, VerticalBarChart, formatDateTime, formatNumber, statusLabel } from "../../admin-analytics-ui";
import { FinanceExportMenu } from "../export-menu";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FinancePointsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const { totals, charts } = await getDashboardAnalytics(period);
  const entries = await db.clarityCreditLedgerEntry.findMany({
    where: { createdAt: { gte: period.start, lte: period.end } },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminHero
        eyebrow="финансы"
        title="Баллы"
        actions={
          <>
            <FinanceExportMenu label="Экспорт баллов" baseHref={`/api/admin/finance/management-report?start=${period.startInput}&end=${period.endInput}&scope=credits`} />
            <PeriodToolbar basePath="/admin/finance/points" start={period.startInput} end={period.endInput} />
          </>
        }
      >
        Покупка, трата, использование и ручные начисления баллов через суперадминку считаются отдельно.
      </AdminHero>
      <MetricGrid>
        <MetricCard label="Купленные за деньги" value={formatNumber(totals.purchasedCredits)} />
        <MetricCard label="Начислены вручную" value={formatNumber(totals.manualCredits)} />
        <MetricCard label="Net изменение" value={formatNumber(totals.creditsBalanceDelta)} />
        <MetricCard label="Операций" value={formatNumber(entries.length)} />
      </MetricGrid>
      <div className="mt-6 grid gap-4">
        <VerticalBarChart label="Баллы на балансе по дням: дневное изменение" data={charts.creditsByDay} />
        <DataTable
          columns={["Дата и время", "Пользователь", "Баллы", "Тип", "Источник", "Статус", "Баланс после"]}
          rows={entries.map((entry) => [
            formatDateTime(entry.createdAt),
            <span key="user">{entry.user.name}<br /><span className="text-xs text-[var(--soft-ink-faint)]">{entry.user.email}</span></span>,
            entry.amount,
            statusLabel(entry.type),
            entry.source,
            <StatusBadge key="status" status={entry.status} />,
            entry.balanceAfter ?? "—",
          ])}
        />
      </div>
    </main>
  );
}
