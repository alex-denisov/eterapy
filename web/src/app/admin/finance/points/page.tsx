export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { getDashboardAnalytics, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, MetricCard, MetricGrid, PeriodToolbar, VerticalBarChart, formatDateTime, formatNumber, statusLabel } from "../../admin-analytics-ui";
import { FinanceExportMenu } from "../export-menu";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const pointColumns: AdminCompactColumn[] = [
  { key: "createdAt", label: "Дата и время", sortable: true, filterKind: "date" },
  { key: "user", label: "Пользователь", sortable: true },
  { key: "amount", label: "Баллы", sortable: true, align: "right" },
  { key: "type", label: "Тип", sortable: true },
  { key: "source", label: "Источник", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "PENDING", label: "Ожидает" },
      { value: "SUCCEEDED", label: "Успешно" },
      { value: "FAILED", label: "Ошибка" },
      { value: "REVOKED", label: "Отозвано" },
    ],
  },
  { key: "balanceAfter", label: "Баланс после", sortable: true, align: "right" },
];

export default async function FinancePointsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const { totals, charts } = await getDashboardAnalytics(period);
  const entries = await db.clarityCreditLedgerEntry.findMany({
    where: { createdAt: { gte: period.start, lte: period.end } },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <main className="mx-auto min-w-0 max-w-7xl overflow-hidden px-4 py-8 sm:px-6">
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
      <div className="mt-6 grid min-w-0 gap-4 overflow-hidden">
        <VerticalBarChart label="Баллы на балансе по дням: дневное изменение" data={charts.creditsByDay} integerTicks />
        <AdminCompactDataTable
          columns={pointColumns}
          rows={entries.map((entry) => {
            const entryStatus = String(entry.status);
            return {
              id: entry.id,
              cells: {
                createdAt: { value: formatDateTime(entry.createdAt), sortValue: entry.createdAt.getTime(), filterValue: formatDateTime(entry.createdAt) },
                user: { value: entry.user.name ?? "—", subvalue: entry.user.email, filterValue: `${entry.user.name ?? ""} ${entry.user.email ?? ""}` },
                amount: { value: entry.amount, sortValue: entry.amount },
                type: statusLabel(entry.type),
                source: entry.source,
                status: { kind: "status", label: statusLabel(entry.status), tone: entryStatus === "SUCCEEDED" ? "ok" : entryStatus === "FAILED" ? "danger" : "warn", filterValue: `${entry.status} ${statusLabel(entry.status)}` },
                balanceAfter: { value: entry.balanceAfter ?? "—", sortValue: entry.balanceAfter ?? -1 },
              },
            };
          })}
          minWidth="1080px"
        />
      </div>
    </main>
  );
}
