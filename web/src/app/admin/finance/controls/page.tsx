export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { AdminHero, AnalyticsSection, DataTable, MetricCard, MetricGrid, PeriodToolbar, StatusBadge, formatDateTime, formatNumber, formatRub } from "../../admin-analytics-ui";
import { resolveAdminPeriod } from "../../admin-analytics-data";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function financeAction(action: string) {
  return /PAYOUT|PAYMENT|REFUND|PRICE|TARIFF|REPORT|RECONCILIATION|YOOKASSA|TRANSACTION/i.test(action);
}

export default async function FinanceControlsPage({ searchParams }: PageProps) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || role !== "SUPERADMIN") redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read") && role !== "SUPERADMIN") redirect("/admin");

  const period = resolveAdminPeriod(await searchParams);
  const [transactions, auditRows, webhookErrors, failedPayouts] = await Promise.all([
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
  ]);
  const financeAudit = auditRows.filter((row) => financeAction(row.action)).slice(0, 30);
  const refunded = transactions.filter((tx) => tx.status === "REFUNDED" || tx.amount < 0).length;
  const pending = transactions.filter((tx) => tx.status === "PENDING").length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-finance-controls">
      <AdminHero
        eyebrow="финансы"
        title="Контроль и журналы финансов"
        actions={<PeriodToolbar basePath="/admin/finance/controls" start={period.startInput} end={period.endInput} />}
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
          <DataTable
            columns={["Дата и время", "Клиент", "Сумма", "Статус", "Провайдер", "ID провайдера"]}
            rows={transactions.map((tx) => [
              formatDateTime(tx.createdAt),
              <span key="user">{tx.user.name}<br /><span className="text-xs text-[var(--soft-ink-faint)]">{tx.user.email}</span></span>,
              formatRub(tx.amount / 100),
              <StatusBadge key="status" status={tx.status} />,
              tx.provider,
              tx.providerPaymentId ?? "—",
            ])}
          />
        </AnalyticsSection>

        <AnalyticsSection title="Аудит финансовых действий">
          <DataTable
            columns={["Дата и время", "Действие", "Администратор", "Цель", "IP", "Детали"]}
            rows={financeAudit.map((row) => [
              formatDateTime(row.createdAt),
              row.action,
              <span key="user" className="font-mono text-xs">{row.userId}</span>,
              <span key="target" className="font-mono text-xs">{row.targetId ?? "—"}</span>,
              row.ip ?? "—",
              <span key="details" className="line-clamp-2 max-w-lg">{row.details ?? "—"}</span>,
            ])}
          />
        </AnalyticsSection>
      </div>
    </main>
  );
}
