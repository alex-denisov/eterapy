export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, MetricCard, MetricGrid, PeriodToolbar, formatDateTime, formatNumber } from "../../admin-analytics-ui";
import { FinanceExportMenu } from "../export-menu";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const reconciliationColumns: AdminCompactColumn[] = [
  { key: "receivedAt", label: "Дата и время", sortable: true, filterKind: "date" },
  { key: "eventType", label: "Событие", sortable: true },
  { key: "resourceId", label: "Resource ID", sortable: true },
  { key: "status", label: "Статус", sortable: true },
  { key: "requestId", label: "Request ID", sortable: true },
  { key: "error", label: "Ошибка", sortable: true },
];

export default async function FinanceReconciliationPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const [webhooks, exportsCount, failed, processed] = await Promise.all([
    db.webhookEvent.findMany({ where: { provider: "yookassa", receivedAt: { gte: period.start, lte: period.end } }, orderBy: { receivedAt: "desc" }, take: 20 }),
    db.webhookEvent.count({ where: { provider: "yookassa", receivedAt: { gte: period.start, lte: period.end } } }),
    db.webhookEvent.count({ where: { provider: "yookassa", status: { in: ["FAILED", "ERROR"] }, receivedAt: { gte: period.start, lte: period.end } } }),
    db.webhookEvent.count({ where: { provider: "yookassa", status: { in: ["PROCESSED", "DONE", "SUCCEEDED"] }, receivedAt: { gte: period.start, lte: period.end } } }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminHero
        eyebrow="финансы"
        title="Сверка и импорт"
        actions={
          <>
            <FinanceExportMenu label="Сформировать сверку" baseHref={`/api/admin/finance/management-report?start=${period.startInput}&end=${period.endInput}&scope=reconciliation`} />
            <PeriodToolbar basePath="/admin/finance/reconciliation" start={period.startInput} end={period.endInput} />
          </>
        }
      >
        Сверка сопоставляет локальные транзакции, webhook-события ЮKassa и экспорт операций за выбранный период.
      </AdminHero>
      <MetricGrid>
        <MetricCard label="Webhook ЮKassa" value={formatNumber(exportsCount)} />
        <MetricCard label="Обработаны" value={formatNumber(processed)} />
        <MetricCard label="Ошибки сверки" value={formatNumber(failed)} tone={failed > 0 ? "danger" : "neutral"} />
        <MetricCard label="Импорт сверки" value="Готов" hint="Принимает файл провайдера в рабочем флоу" />
      </MetricGrid>
      <div className="mt-6">
        <AdminCompactDataTable
          columns={reconciliationColumns}
          rows={webhooks.map((event) => ({
            id: event.id,
            cells: {
              receivedAt: { value: formatDateTime(event.receivedAt), sortValue: event.receivedAt.getTime(), filterValue: formatDateTime(event.receivedAt) },
              eventType: event.eventType,
              resourceId: event.resourceId ?? "—",
              status: event.status,
              requestId: event.requestId ?? "—",
              error: event.error ?? "—",
            },
          }))}
          empty="Webhook-событий за выбранный период нет"
          minWidth="1120px"
        />
      </div>
    </main>
  );
}
