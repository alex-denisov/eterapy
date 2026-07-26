export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { computePractitionerBalances } from "@/lib/practitioner-balance";
import { evaluateSplitReadiness } from "@/lib/payments/robokassa-split";
import { AdminHero, MetricCard, MetricGrid } from "../../admin-analytics-ui";
import { formatAdminRub, formatCbrRateLabel, getAdminCurrencyRates, resolveAdminCurrency } from "../../admin-currency";
import { AdminCurrencySelector } from "../../admin-currency-selector";
import { FinanceExportMenu } from "../export-menu";
import { PaymentsPanel } from "../../payments/payments-panel";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FinancePayoutsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session || session.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const currency = resolveAdminCurrency(params);

  const practitioners = await db.practitioner.findMany({
    where: { status: "ACTIVE" },
    include: {
      user: { select: { name: true, email: true } },
      bookings: {
        where: { status: "COMPLETED" },
        select: { id: true, priceRub: true, createdAt: true, commissionPercentApplied: true },
      },
      payouts: {
        where: { status: "DONE" },
        select: { processedAt: true, amountKopecks: true },
        orderBy: { processedAt: "desc" },
        take: 1,
      },
      // B583: адресат сплита. Остальное, от чего зависит его исполнимость
      // (`inn`, `taxReviewStatus`, `status`), приходит скалярами через `include`.
      payoutDetails: { select: { type: true, kycStatus: true, robokassaAccount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const [balances, payoutRuns, currencyRates] = await Promise.all([
    computePractitionerBalances(practitioners.map((p) => p.id)),
    db.payoutRun.findMany({ orderBy: { scheduledFor: "desc" }, take: 10 }),
    getAdminCurrencyRates(),
  ]);

  const list = practitioners.map((p) => {
    const commissionPercent = p.commissionPercent ?? 35;
    const totalRevenue = p.bookings.reduce((sum, booking) => sum + booking.priceRub, 0);
    const platformFee = p.bookings.reduce((sum, booking) => {
      const applied = booking.commissionPercentApplied ?? commissionPercent;
      return sum + Math.round(booking.priceRub * (applied / 100));
    }, 0);
    const balance = balances.get(p.id);
    return {
      id: p.id,
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      sessionCount: p.bookings.length,
      totalRevenue,
      commissionPercent,
      platformFee,
      practitionerEarnings: Math.max(0, (balance?.currentBalance ?? 0) + (balance?.availablePayout ?? 0)),
      heldPayout: Math.max(0, balance?.heldPayout ?? 0),
      reservePayout: Math.max(0, balance?.reservePayout ?? 0),
      payoutDetailsType: p.payoutDetails?.type ?? null,
      kycStatus: p.payoutDetails?.kycStatus ?? null,
      // B583: почему сплит по этому специалисту нельзя исполнить автоматически.
      // Показываем ПРИЧИНУ, а не «нельзя»: без неё администратор не знает,
      // что именно просить у специалиста.
      splitReadiness: evaluateSplitReadiness({
        robokassaAccount: p.payoutDetails?.robokassaAccount,
        taxVerified: Boolean(p.inn) && p.taxReviewStatus === "VERIFIED",
        // Выборка выше уже ограничена ACTIVE.
        practitionerActive: true,
      }),
      robokassaAccount: p.payoutDetails?.robokassaAccount ?? null,
      lastPayout: p.payouts[0]?.processedAt?.toISOString() ?? null,
    };
  });

  const totals = {
    revenue: list.reduce((sum, row) => sum + row.totalRevenue, 0),
    platform: list.reduce((sum, row) => sum + row.platformFee, 0),
    practitioners: list.reduce((sum, row) => sum + row.practitionerEarnings, 0),
    held: list.reduce((sum, row) => sum + row.heldPayout + row.reservePayout, 0),
  };
  const reportHref = "/api/admin/finance/management-report?scope=payouts";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-finance-payouts">
      <AdminHero
        eyebrow="финансы"
        title="Выплаты практикам"
        actions={
          <>
            <FinanceExportMenu label="Экспорт выплат" baseHref={reportHref} />
            <AdminCurrencySelector basePath="/admin/finance/payouts" currency={currency} rateLabel={formatCbrRateLabel(currencyRates)} />
          </>
        }
      >
        {/* B583 (решение владельца 2026-07-26): выплаты исполняет Robokassa
            сплитом при снятии холда. Управлять моментом и суммой выплаты с
            нашей стороны нельзя — панель показывает состояние и готовность, а
            не распоряжается деньгами. Писать «селективные выплаты» значило бы
            обещать управление, которого нет. */}
        Комиссии практиков, KYC реквизитов, удержания и резерв по спорным операциям.
        Выплату исполняет Robokassa сплитом при снятии холда с оплаты клиента —
        здесь видно готовность к сплиту и учёт, но не управление переводом.
      </AdminHero>

      <MetricGrid>
        <MetricCard label="Оборот сессий" value={formatAdminRub(totals.revenue, currency, currencyRates)} />
        <MetricCard label="Комиссия платформы" value={formatAdminRub(totals.platform, currency, currencyRates)} />
        <MetricCard label="К выплате" value={formatAdminRub(totals.practitioners, currency, currencyRates)} />
        <MetricCard label="Удержано / резерв" value={formatAdminRub(totals.held, currency, currencyRates)} tone={totals.held > 0 ? "warn" : "neutral"} />
      </MetricGrid>

      <div className="mt-6">
        <PaymentsPanel
          practitioners={list}
          clarityCredits={[]}
          showCredits={false}
          currency={currency}
          usdRub={currencyRates.usdRub}
          payoutRuns={payoutRuns.map((run) => ({
            id: run.id,
            scheduledFor: run.scheduledFor.toISOString(),
            status: run.status,
            candidateCount: run.candidateCount,
            processingCount: run.processingCount,
            heldCount: run.heldCount,
            totalDisbursedKopecks: run.totalDisbursedKopecks,
            totalReserveKopecks: run.totalReserveKopecks,
            completedAt: run.completedAt?.toISOString() ?? null,
          }))}
        />
      </div>

    </main>
  );
}
