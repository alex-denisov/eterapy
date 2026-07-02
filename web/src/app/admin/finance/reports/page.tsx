export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, PeriodToolbar, formatDateTime } from "../../admin-analytics-ui";
import { formatAdminRub, formatCbrRateLabel, getAdminCurrencyRates, resolveAdminCurrency } from "../../admin-currency";
import { AdminCurrencySelector } from "../../admin-currency-selector";
import { FinanceExportMenu } from "../export-menu";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const reportColumns: AdminCompactColumn[] = [
  { key: "practitioner", label: "Практик", sortable: true },
  { key: "plan", label: "Тариф", sortable: true },
  { key: "commission", label: "% комиссии", sortable: true, align: "right" },
  { key: "period", label: "Период", sortable: true, filterKind: "date" },
  { key: "sessions", label: "Сессии", sortable: true, align: "right" },
  { key: "gross", label: "Оборот", sortable: true, align: "right" },
  { key: "commissionAmount", label: "Комиссия", sortable: true, align: "right" },
  { key: "payout", label: "К выплате", sortable: true, align: "right" },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "DRAFT", label: "Черновик" },
      { value: "READY", label: "Готово" },
      { value: "SENT", label: "Отправлено" },
      { value: "PAID", label: "Оплачено" },
    ],
  },
  { key: "createdAt", label: "Создан", sortable: true, filterKind: "date" },
];

export default async function FinanceReportsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const currency = resolveAdminCurrency(params);
  const [reports, currencyRates] = await Promise.all([
  db.agentReport.findMany({
    where: { periodStart: { gte: period.start }, periodEnd: { lte: period.end } },
    include: { practitioner: { include: { user: { select: { name: true, email: true } } } } },
    orderBy: { periodEnd: "desc" },
    take: 500,
  }),
  getAdminCurrencyRates(),
  ]);
  const reportHref = `/api/admin/finance/management-report?start=${period.startInput}&end=${period.endInput}&scope=agent-reports`;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminHero
        eyebrow="финансы"
        title="Выплаты и электронные отчеты практиков"
        actions={
          <>
            <FinanceExportMenu label="Сформировать отчеты за период" baseHref={reportHref} />
            <FinanceExportMenu label="Экспорт отчетов" baseHref={reportHref} />
            <AdminCurrencySelector basePath="/admin/finance/reports" currency={currency} rateLabel={formatCbrRateLabel(currencyRates)} />
            <PeriodToolbar basePath="/admin/finance/reports" start={period.startInput} end={period.endInput} />
          </>
        }
      >
        Электронный отчет услуг за период, привязанный к тарифу практика, комиссии и статусу выплаты.
      </AdminHero>

      <AdminCompactDataTable
        columns={reportColumns}
        rows={reports.map((report) => {
          const plan = report.metadata && typeof report.metadata === "object" && !Array.isArray(report.metadata) && typeof (report.metadata as Record<string, unknown>).planKey === "string"
            ? String((report.metadata as Record<string, unknown>).planKey)
            : report.practitioner.commissionSource;
          return {
            id: report.id,
            cells: {
              practitioner: { value: report.practitioner.user.name, subvalue: report.practitioner.user.email, filterValue: `${report.practitioner.user.name} ${report.practitioner.user.email}` },
              plan,
              commission: { value: `${report.practitioner.commissionPercent}%`, sortValue: report.practitioner.commissionPercent },
              period: {
                value: `${formatDateTime(report.periodStart)} — ${formatDateTime(report.periodEnd)}`,
                sortValue: report.periodStart.getTime(),
                filterValue: `${formatDateTime(report.periodStart)} ${formatDateTime(report.periodEnd)}`,
              },
              sessions: { value: report.sessionCount, sortValue: report.sessionCount },
              gross: { value: formatAdminRub(report.grossKopecks / 100, currency, currencyRates), sortValue: report.grossKopecks },
              commissionAmount: { value: formatAdminRub(report.commissionKopecks / 100, currency, currencyRates), sortValue: report.commissionKopecks },
              payout: { value: formatAdminRub(report.payoutDueKopecks / 100, currency, currencyRates), sortValue: report.payoutDueKopecks },
              status: report.status,
              createdAt: { value: formatDateTime(report.createdAt), sortValue: report.createdAt.getTime(), filterValue: formatDateTime(report.createdAt) },
            },
          };
        })}
        empty="Отчетов за выбранный период пока нет"
        minWidth="1280px"
      />
    </main>
  );
}
