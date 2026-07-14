// B466 — shared server data layer for the «Финансы» section (balance tab +
// «Движение средств» drill-down). Money math mirrors practitioner-balance.ts;
// «Удержано» = session hold ONLY (owner decision — no chargeback reserve).

import db from "@/lib/db";
import { computePractitionerBalances, type PractitionerBalance } from "@/lib/practitioner-balance";

export interface FinanceMovement {
  id: string;
  kind: "earning" | "payout" | "hold";
  date: Date;
  amountRub: number;
  label: string;
  sublabel: string;
  status: string;
}

export interface PractitionerFinanceData {
  commissionPercent: number;
  balance: PractitionerBalance | null;
  /** «Доступно к выплате» — canonical, same figure as the header. */
  currentBalance: number;
  heldPayout: number;
  totalRevenue: number;
  totalFee: number;
  accruedNet: number;
  paidOut: number;
  doneAmount: number;
  monthNet: number;
  monthCount: number;
  monthKey: string;
  byMonth: Array<{ month: string; key: string; count: number; net: number; gross: number }>;
  movements: FinanceMovement[];
  completedCount: number;
}

const MONTH_FMT = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});

// Стабильный YYYY-MM ключ месяца по МСК — для группировки и ссылок выгрузки отчётов.
const ISO_MONTH_FMT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Europe/Moscow",
});

function isoMonthKey(date: Date): string {
  const parts = ISO_MONTH_FMT.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

export async function loadPractitionerFinance(practitionerId: string): Promise<PractitionerFinanceData> {
  const [practitioner, completedBookings, payouts, balance] = await Promise.all([
    db.practitioner.findUnique({
      where: { id: practitionerId },
      select: { commissionPercent: true },
    }),
    db.booking.findMany({
      where: { practitionerId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        priceRub: true,
        commissionPercentApplied: true,
        source: true,
        createdAt: true,
        client: { select: { name: true } },
      },
    }),
    db.payout.findMany({
      where: { practitionerId },
      orderBy: { createdAt: "desc" },
    }),
    computePractitionerBalances([practitionerId]).then((map) => map.get(practitionerId) ?? null),
  ]);

  const commissionPercent = practitioner?.commissionPercent ?? 35;
  const commissionOf = (b: { commissionPercentApplied: number | null }) =>
    b.commissionPercentApplied ?? commissionPercent;
  const netOf = (rub: number, applied: number) => rub - Math.round(rub * (applied / 100));

  const totalRevenue = completedBookings.reduce((s, b) => s + b.priceRub, 0);
  const totalFee = completedBookings.reduce((s, b) => s + Math.round(b.priceRub * (commissionOf(b) / 100)), 0);
  const accruedNet = totalRevenue - totalFee;
  const donePayouts = payouts.filter((p) => p.status === "DONE");
  const paidOut = Math.round(donePayouts.reduce((s, p) => s + p.amountKopecks, 0) / 100);

  const now = new Date();
  const monthKey = MONTH_FMT.format(now);
  const byMonthMap = new Map<string, { count: number; net: number; gross: number; label: string }>();
  for (const b of completedBookings) {
    const key = isoMonthKey(b.createdAt);
    const entry = byMonthMap.get(key) ?? { count: 0, net: 0, gross: 0, label: MONTH_FMT.format(b.createdAt) };
    byMonthMap.set(key, {
      count: entry.count + 1,
      net: entry.net + netOf(b.priceRub, commissionOf(b)),
      gross: entry.gross + b.priceRub,
      label: entry.label,
    });
  }
  const byMonth = [...byMonthMap.entries()].map(([key, data]) => ({
    month: data.label,
    key,
    count: data.count,
    net: data.net,
    gross: data.gross,
  }));
  const monthEntry = byMonthMap.get(isoMonthKey(now)) ?? { count: 0, net: 0, gross: 0, label: monthKey };

  const movements: FinanceMovement[] = [
    ...completedBookings.map<FinanceMovement>((b) => {
      const applied = commissionOf(b);
      const own = b.source === "BYOC";
      return {
        id: `b-${b.id}`,
        kind: "earning",
        date: b.createdAt,
        amountRub: netOf(b.priceRub, applied),
        label: `Сессия · ${b.client.name ?? "Клиент"}${own ? " · свой клиент" : ""}`,
        sublabel: `${own ? "По вашей ссылке" : "Платформа"} · ${b.priceRub.toLocaleString("ru")} ₽ − ${applied}% комиссия`,
        status: "COMPLETED",
      };
    }),
    ...payouts.flatMap<FinanceMovement>((p) => {
      const netRub = Math.round(p.amountKopecks / 100);
      if (p.status === "PENDING" && p.availableAt && p.availableAt.getTime() > Date.now()) {
        // Session hold: деньги начислены, но период удержания ещё не истёк.
        return [{
          id: `h-${p.id}`,
          kind: "hold",
          date: p.createdAt,
          amountRub: netRub,
          label: "Удержание по сессии",
          sublabel: `hold по тарифу${p.holdDays ? ` · ${p.holdDays} дн` : ""} · снимется ${DAY_FMT.format(p.availableAt)}`,
          status: "HOLD",
        }];
      }
      const labels: Record<string, string> = {
        PENDING: "К выплате",
        HELD: "Удержана (рассмотрение жалобы)",
        PROCESSING: "Выплата в процессе",
        DONE: "Выплата",
        FAILED: "Выплата не прошла",
      };
      return [{
        id: `p-${p.id}`,
        kind: "payout",
        date: p.processedAt ?? p.createdAt,
        amountRub: netRub,
        label: labels[p.status] ?? "Выплата",
        sublabel: p.status === "DONE" ? "на подтверждённые реквизиты · выполнено" : "по графику 1-го и 15-го (МСК)",
        status: p.status,
      }];
    }),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    commissionPercent,
    balance,
    currentBalance: Math.max(0, (balance?.currentBalance ?? accruedNet - paidOut) + (balance?.availablePayout ?? 0)),
    heldPayout: Math.max(0, balance?.heldPayout ?? 0),
    totalRevenue,
    totalFee,
    accruedNet,
    paidOut,
    doneAmount: paidOut,
    monthNet: monthEntry.net,
    monthCount: monthEntry.count,
    monthKey,
    byMonth,
    movements,
    completedCount: completedBookings.length,
  };
}
