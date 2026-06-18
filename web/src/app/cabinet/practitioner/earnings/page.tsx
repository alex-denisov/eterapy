export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { CalendarClock, Wallet } from "lucide-react";
import { PAYOUT_TZ, formatPayoutDate, nextPayoutDate } from "@/lib/payout-schedule";
import { computePractitionerBalances } from "@/lib/practitioner-balance";
import { EarningsMovementsTable, type EarningsMovementRow } from "./earnings-movements-table";
import { PayoutDetailsForm } from "./payout-details-form";
import { AgentOfferAcceptButton } from "./agent-offer-accept-button";
import { AGENT_OFFER_VERSION } from "@/lib/practitioner-compliance";

interface Movement {
  id: string;
  kind: "earning" | "payout";
  date: Date;
  amountRub: number;
  label: string;
  sublabel: string;
  status: string;
}

export default async function PractitionerEarningsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    select: {
      id: true,
      commissionPercent: true,
      agentOfferAcceptedAt: true,
      agentOfferVersion: true,
      taxStatus: true,
      taxReviewStatus: true,
      taxStatusVerifiedAt: true,
      payoutDetails: {
        select: {
          type: true,
          accountNumber: true,
          bankName: true,
          legalName: true,
          inn: true,
          kpp: true,
          bik: true,
          corrAccount: true,
          kycStatus: true,
          kycVerifiedAt: true,
        },
      },
    },
  });
  if (!practitioner) redirect("/cabinet/practitioner");

  const commissionPercent = practitioner.commissionPercent ?? 35;

  const [completedBookings, payouts] = await Promise.all([
    db.booking.findMany({
      where: { practitionerId: practitioner.id, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    }),
    db.payout.findMany({
      where: { practitionerId: practitioner.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const bookingCommission = (booking: { commissionPercentApplied: number | null }) =>
    booking.commissionPercentApplied ?? commissionPercent;
  const netOf = (rub: number, appliedCommissionPercent = commissionPercent) =>
    rub - Math.round(rub * (appliedCommissionPercent / 100));

  const totalRevenue = completedBookings.reduce((s, b) => s + b.priceRub, 0);
  const totalFee = completedBookings.reduce((sum, booking) => (
    sum + Math.round(booking.priceRub * (bookingCommission(booking) / 100))
  ), 0);
  const accruedNet = totalRevenue - totalFee;

  const paidOutKopecks = payouts
    .filter((p) => p.status === "DONE")
    .reduce((s, p) => s + p.amountKopecks, 0);
  const paidOut = Math.round(paidOutKopecks / 100);

  const pendingPayoutKopecks = payouts
    .filter((p) => p.status === "PENDING" || p.status === "PROCESSING" || p.status === "HELD")
    .reduce((s, p) => s + p.amountKopecks, 0);
  const pendingPayout = Math.round(pendingPayoutKopecks / 100);

  // X5: use the CANONICAL balance (shared with the header + admin) so the
  // «к выплате» figure matches the public-shell-header. The local formula above
  // omitted `internalCharges`, which is why the page showed 33 750 while the
  // header showed the canonical 32 360.
  const canonicalBalance = (await computePractitionerBalances([practitioner.id])).get(practitioner.id);
  const internalCharges = canonicalBalance?.internalCharges ?? 0;
  const currentBalance = Math.max(
    0,
    (canonicalBalance?.currentBalance ?? (accruedNet - paidOut - pendingPayout)) +
      (canonicalBalance?.availablePayout ?? 0),
  );
  const heldPayout = Math.max(0, canonicalBalance?.heldPayout ?? 0);
  const reservePayout = Math.max(0, canonicalBalance?.reservePayout ?? 0);

  const now = new Date();
  const nextPayoutOn = nextPayoutDate(now);
  const agentOfferAccepted = Boolean(
    practitioner.agentOfferAcceptedAt && practitioner.agentOfferVersion === AGENT_OFFER_VERSION,
  );

  // Текущий месяц
  const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: PAYOUT_TZ,
  });
  const monthKey = monthFormatter.format(now);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthBookings = completedBookings.filter((b) => new Date(b.createdAt) >= startOfMonth);
  const monthNet = monthBookings.reduce((sum, booking) => (
    sum + netOf(booking.priceRub, bookingCommission(booking))
  ), 0);

  // Группировка по месяцам
  const byMonth: Record<string, { revenue: number; count: number; net: number }> = {};
  for (const b of completedBookings) {
    const key = monthFormatter.format(new Date(b.createdAt));
    if (!byMonth[key]) byMonth[key] = { revenue: 0, count: 0, net: 0 };
    byMonth[key].revenue += b.priceRub;
    byMonth[key].count += 1;
    byMonth[key].net += netOf(b.priceRub, bookingCommission(b));
  }

  // Движение средств: зачисления (сессии) + списания (выплаты)
  const movements: Movement[] = [
    ...completedBookings.map<Movement>((b) => {
      const sourceLabel = b.source === "BYOC" ? "BYOC" : "Платформа";
      return {
        id: `b-${b.id}`,
        kind: "earning",
        date: new Date(b.createdAt),
        amountRub: netOf(b.priceRub, bookingCommission(b)),
        label: `Сессия · ${b.client.name}`,
        sublabel: `${sourceLabel} · ${b.priceRub.toLocaleString("ru")} ₽ − ${bookingCommission(b)}% комиссия`,
        status: "COMPLETED",
      };
    }),
    ...payouts.map<Movement>((p) => {
      const labels: Record<string, string> = {
        PENDING: "Ожидает выплаты",
        HELD: "Удержана (рассмотрение жалобы)",
        PROCESSING: "В процессе",
        DONE: "Выплата",
        FAILED: "Удержана (по решению модератора)",
      };
      const netRub = Math.round(p.amountKopecks / 100);
      // Восстанавливаем gross (priceRub до вычета комиссии): net = price * (1 - c/100) ⇒ price = net / (1 - c/100)
      const commission = commissionPercent / 100;
      const grossRub = commission < 1 ? Math.round(netRub / (1 - commission)) : netRub;
      const feeRub = grossRub - netRub;
      const holdDetails = p.holdDays ? ` · hold ${p.holdDays} дн` : "";
      const reserveDetails = p.reserveKopecks > 0
        ? ` · резерв ${Math.round(p.reserveKopecks / 100).toLocaleString("ru")} ₽`
        : "";
      return {
        id: `p-${p.id}`,
        kind: "payout",
        date: p.processedAt ?? p.createdAt,
        amountRub: netRub,
        label: labels[p.status] ?? "Выплата",
        sublabel: `Сессия · ${grossRub.toLocaleString("ru")} ₽ − комиссия ${feeRub.toLocaleString("ru")} ₽ (${commissionPercent}%)${holdDetails}${reserveDetails}`,
        status: p.status,
      };
    }),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const movementRows: EarningsMovementRow[] = movements.map((movement) => ({
    ...movement,
    dateIso: movement.date.toISOString(),
  }));

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="soft-eyebrow">Финансы практика</div>
      <h1 className="soft-h1 mt-2 mb-1">Баланс и доходы</h1>
      <p className="text-sm mb-6" style={{ color: "var(--soft-ink-soft)" }}>
        Денежный баланс кабинета, движение средств и предстоящие выплаты.
      </p>

      {/* Баланс + удержания */}
      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        <div className="soft-card">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg soft-select-pill">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[var(--soft-ink-soft)]">Доступно к выплате</p>
                <p className="font-heading text-2xl font-bold text-[var(--soft-bordeaux)] tabular-nums">
                  {currentBalance.toLocaleString("ru")} ₽
                </p>
                <p className="text-xs text-[var(--soft-ink-soft)] mt-0.5">
                  Оборот {totalRevenue.toLocaleString("ru")} ₽ − комиссия {totalFee.toLocaleString("ru")} ₽ по ставкам завершённых сессий = {accruedNet.toLocaleString("ru")} ₽ чистыми.
                  {paidOut > 0 && ` Выплачено ${paidOut.toLocaleString("ru")} ₽.`}
                  {pendingPayout > 0 && ` В обработке ${pendingPayout.toLocaleString("ru")} ₽.`}
                  {internalCharges > 0 && ` Списано на подписку практика ${internalCharges.toLocaleString("ru")} ₽.`}
                  {" "}Та же цифра — в шапке кабинета.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="soft-card">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[var(--soft-ink-soft)]">Удержано</p>
                <p className="font-heading text-2xl font-bold text-foreground">
                  {heldPayout.toLocaleString("ru")} ₽
                </p>
                <p className="text-xs text-[var(--soft-ink-soft)] mt-0.5">
                  Hold по тарифу, риск/KYC и резерв chargeback.
                  {reservePayout > 0 && ` Резерв: ${reservePayout.toLocaleString("ru")} ₽.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* X13: payout requisites mechanic (была отсылка «реквизиты в настройках»,
          но самой механики не было). */}
      <div className="mb-6">
        <div className="soft-card mb-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="soft-eyebrow">агентская оферта</p>
              <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
                Версия {AGENT_OFFER_VERSION}. Налоговый статус: {practitioner.taxStatus} / {practitioner.taxReviewStatus}.
              </p>
            </div>
            <AgentOfferAcceptButton accepted={agentOfferAccepted} />
          </div>
        </div>
        <PayoutDetailsForm initial={practitioner.payoutDetails ?? null} />
      </div>

      {/* Итоги */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { label: monthKey, value: `${monthNet.toLocaleString("ru")} ₽`, sub: `${monthBookings.length} сессий`, color: "text-foreground" },
          { label: "Всего заработано", value: `${accruedNet.toLocaleString("ru")} ₽`, sub: `${completedBookings.length} сессий`, color: "text-foreground" },
          { label: "Уже выплачено", value: `${paidOut.toLocaleString("ru")} ₽`, sub: `${payouts.filter((p) => p.status === "DONE").length} выплат`, color: "text-[var(--soft-ink-soft)]" },
          { label: "Комиссия платформы", value: `${totalFee.toLocaleString("ru")} ₽`, sub: "по ставкам сессий", color: "text-[var(--soft-ink-soft)]" },
        ].map((s) => (
          <div key={s.label} className="soft-card">
            <div className="p-4">
              <p className="text-xs text-[var(--soft-ink-soft)] mb-1 capitalize">{s.label}</p>
              <p className={`font-heading text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-[var(--soft-ink-soft)] mt-0.5">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Баннер о графике выплат */}
      <div className="soft-card mb-6 p-4 text-sm text-[var(--soft-ink-soft)]">
        <p className="font-medium text-foreground mb-1">График выплат</p>
        Выплаты начисляются дважды в месяц — <span className="text-foreground">1-го и 15-го числа</span>{" "}
        по московскому времени. Hold зависит от тарифа: Free 7 дней, Pro 3 дня, Pro+ 1 день. Жалобы,
        KYC юр.лица, резерв chargeback и риск-сигналы удерживают сумму до проверки. Следующая дата:{" "}
        <span className="text-foreground">{formatPayoutDate(nextPayoutOn)}</span>.
      </div>

      {/* Движение средств */}
      <div className="mb-6">
        <h2 className="font-semibold mb-3">Движение средств</h2>
        <EarningsMovementsTable rows={movementRows} />
      </div>

      {/* По месяцам */}
      {Object.keys(byMonth).length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-3">По месяцам</h2>
          <div className="soft-card overflow-hidden divide-y divide-border/10">
            {Object.entries(byMonth).map(([month, data]) => (
              <div key={month} className="flex items-center gap-4 px-4 py-3">
                <span className="text-sm flex-1 capitalize">{month}</span>
                <span className="text-xs text-[var(--soft-ink-soft)] w-16 text-right">{data.count} сессий</span>
                <span className="text-sm w-24 text-right text-[var(--soft-ink-soft)]">
                  {data.revenue.toLocaleString("ru")} ₽
                </span>
                <span className="text-sm w-28 text-right font-medium text-green-400">
                  {data.net.toLocaleString("ru")} ₽ чистыми
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
