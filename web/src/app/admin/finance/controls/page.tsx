export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { AdminHero, AnalyticsSection, MetricCard, MetricGrid, PeriodToolbar, formatDateTime, formatNumber, statusLabel } from "../../admin-analytics-ui";
import { resolveAdminPeriod } from "../../admin-analytics-data";
import { formatAdminRub, formatCbrRateLabel, getAdminCurrencyRates, resolveAdminCurrency } from "../../admin-currency";
import { AdminCurrencySelector } from "../../admin-currency-selector";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const operationColumns: AdminCompactColumn[] = [
  { key: "createdAt", label: "Дата и время", sortable: true, filterKind: "date" },
  { key: "client", label: "Клиент", sortable: true },
  { key: "amount", label: "Сумма", sortable: true, align: "right" },
  { key: "status", label: "Статус", sortable: true },
  { key: "provider", label: "Провайдер", sortable: true },
  { key: "providerId", label: "ID провайдера", sortable: true },
];

const auditColumns: AdminCompactColumn[] = [
  { key: "createdAt", label: "Дата и время", sortable: true, filterKind: "date" },
  { key: "action", label: "Действие", sortable: true },
  { key: "userId", label: "Администратор", sortable: true },
  { key: "targetId", label: "Цель", sortable: true },
  { key: "ip", label: "IP", sortable: true },
  { key: "details", label: "Детали", sortable: true },
];

function financeAction(action: string) {
  return /PAYOUT|PAYMENT|REFUND|PRICE|TARIFF|REPORT|RECONCILIATION|YOOKASSA|TRANSACTION/i.test(action);
}

export default async function FinanceControlsPage({ searchParams }: PageProps) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || role !== "SUPERADMIN") redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read") && role !== "SUPERADMIN") redirect("/admin");

  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const currency = resolveAdminCurrency(params);
  const [transactions, auditRows, webhookErrors, failedPayouts, currencyRates] = await Promise.all([
    db.transaction.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.auditLog.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: { id: true, action: true, userId: true, targetId: true, details: true, ip: true, createdAt: true },
    }),
    db.webhookEvent.count({ where: { provider: "yookassa", status: { in: ["FAILED", "ERROR"] }, receivedAt: { gte: period.start, lte: period.end } } }),
    db.payout.count({ where: { status: { in: ["FAILED", "HELD"] }, createdAt: { gte: period.start, lte: period.end } } }),
    getAdminCurrencyRates(),
  ]);
  const financeAudit = auditRows.filter((row) => financeAction(row.action)).slice(0, 30);
  const refunded = transactions.filter((tx) => tx.status === "REFUNDED" || tx.amount < 0).length;
  const pending = transactions.filter((tx) => tx.status === "PENDING").length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-finance-controls">
      <AdminHero
        eyebrow="финансы"
        title="Контроль и журналы"
        actions={<><AdminCurrencySelector basePath="/admin/finance/controls" currency={currency} rateLabel={formatCbrRateLabel(currencyRates)} /><PeriodToolbar basePath="/admin/finance/controls" start={period.startInput} end={period.endInput} /></>}
      >
        Финансовые события, транзакции, возвраты, ошибки YooKassa, удержанные выплаты и аудит изменений цен/тарифов.
      </AdminHero>

      <MetricGrid>
        <MetricCard label="Транзакции" value={formatNumber(transactions.length)} />
        <MetricCard label="Возвраты" value={formatNumber(refunded)} tone={refunded > 0 ? "warn" : "neutral"} />
        <MetricCard label="Ожидают оплаты" value={formatNumber(pending)} tone={pending > 0 ? "warn" : "neutral"} />
        <MetricCard label="Ошибки выплат/чеков" value={formatNumber(webhookErrors + failedPayouts)} tone={webhookErrors + failedPayouts > 0 ? "danger" : "neutral"} />
      </MetricGrid>

      <div className="mt-6 grid gap-4">
        <AnalyticsSection title="Последние финансовые операции">
          <AdminCompactDataTable
            columns={operationColumns}
            rows={transactions.map((tx) => {
              const txStatus = String(tx.status);
              return {
              id: tx.id,
              cells: {
                createdAt: { value: formatDateTime(tx.createdAt), sortValue: tx.createdAt.getTime(), filterValue: formatDateTime(tx.createdAt) },
                client: { value: tx.user.name ?? "—", subvalue: tx.user.email, filterValue: `${tx.user.name ?? ""} ${tx.user.email ?? ""}` },
                amount: { value: formatAdminRub(tx.amount / 100, currency, currencyRates), sortValue: tx.amount },
                status: { kind: "status", label: statusLabel(tx.status), tone: txStatus === "SUCCEEDED" ? "ok" : txStatus === "FAILED" ? "danger" : "warn", filterValue: `${tx.status} ${statusLabel(tx.status)}` },
                provider: tx.provider,
                providerId: tx.providerPaymentId ?? "—",
              },
            };
            })}
            minWidth="1120px"
          />
        </AnalyticsSection>

        <AnalyticsSection title="Аудит финансовых действий">
          <AdminCompactDataTable
            columns={auditColumns}
            rows={financeAudit.map((row) => ({
              id: row.id,
              cells: {
                createdAt: { value: formatDateTime(row.createdAt), sortValue: row.createdAt.getTime(), filterValue: formatDateTime(row.createdAt) },
                action: row.action,
                userId: { value: row.userId, title: row.userId },
                targetId: row.targetId ?? "—",
                ip: row.ip ?? "—",
                details: { value: row.details ?? "—", title: row.details ?? "—" },
              },
            }))}
            empty="Финансовых действий за выбранный период нет"
            minWidth="1240px"
          />
        </AnalyticsSection>
      </div>
    </main>
  );
}
