export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, DataTable, PeriodToolbar, formatDateTime, formatRub } from "../../admin-analytics-ui";
import { FinanceExportMenu } from "../export-menu";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FinanceReportsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const reports = await db.agentReport.findMany({
    where: { periodStart: { gte: period.start }, periodEnd: { lte: period.end } },
    include: { practitioner: { include: { user: { select: { name: true, email: true } } } } },
    orderBy: { periodEnd: "desc" },
    take: 20,
  });
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
            <PeriodToolbar basePath="/admin/finance/reports" start={period.startInput} end={period.endInput} />
          </>
        }
      >
        Электронный отчет услуг за период, привязанный к тарифу практика, комиссии и статусу выплаты.
      </AdminHero>

      <DataTable
        columns={["Практик", "Тариф", "% комиссии", "Период", "Сессии", "Оборот", "Комиссия", "К выплате", "Статус", "Создан"]}
        rows={reports.map((report) => [
          <span key="name">{report.practitioner.user.name}<br /><span className="text-xs text-[var(--soft-ink-faint)]">{report.practitioner.user.email}</span></span>,
          report.metadata && typeof report.metadata === "object" && !Array.isArray(report.metadata) && typeof (report.metadata as Record<string, unknown>).planKey === "string"
            ? String((report.metadata as Record<string, unknown>).planKey)
            : report.practitioner.commissionSource,
          `${report.practitioner.commissionPercent}%`,
          `${formatDateTime(report.periodStart)} — ${formatDateTime(report.periodEnd)}`,
          report.sessionCount,
          formatRub(report.grossKopecks / 100),
          formatRub(report.commissionKopecks / 100),
          formatRub(report.payoutDueKopecks / 100),
          report.status,
          formatDateTime(report.createdAt),
        ])}
        empty="Отчетов за выбранный период пока нет"
      />
    </main>
  );
}
