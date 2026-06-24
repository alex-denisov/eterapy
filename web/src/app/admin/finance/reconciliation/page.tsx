export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, DataTable, MetricCard, MetricGrid, PeriodToolbar, formatDateTime, formatNumber } from "../../admin-analytics-ui";
import { FinanceExportMenu } from "../export-menu";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
        <DataTable
          columns={["Timestamp", "Событие", "Resource ID", "Статус", "Request ID", "Ошибка"]}
          rows={webhooks.map((event) => [
            formatDateTime(event.receivedAt),
            event.eventType,
            event.resourceId ?? "—",
            event.status,
            event.requestId ?? "—",
            event.error ?? "—",
          ])}
        />
      </div>
    </main>
  );
}
