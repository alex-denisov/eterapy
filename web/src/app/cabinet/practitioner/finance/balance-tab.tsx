import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatPayoutDate, nextPayoutDate } from "@/lib/payout-schedule";
import { PAYOUT_HOLD_DAYS_BY_PLAN, type PractitionerPayoutPlanKey } from "@/lib/payout-runs";
import { practitionerTierName, type PractitionerTier } from "@/lib/practitioner-tier";
import { appUrl } from "@/lib/subdomain";
import type { PractitionerFinanceData } from "./finance-data";

// B466 — «Финансы → Баланс» (mockup practitioner-finance-balance): money-hero
// «доступно к выплате», «Удержано» = session-hold only (tappable → Движение
// средств), 4 итога, движение средств (превью) + график выплат + по месяцам.

const TIER_TO_PAYOUT_PLAN: Record<PractitionerTier, PractitionerPayoutPlanKey> = {
  free: "base",
  pro: "practitioner_pro",
  pro_plus: "practitioner_pro_plus",
};

export function BalanceTab({ data, tier }: { data: PractitionerFinanceData; tier: PractitionerTier }) {
  const holdDays = PAYOUT_HOLD_DAYS_BY_PLAN[TIER_TO_PAYOUT_PLAN[tier]];
  const nextPayout = formatPayoutDate(nextPayoutDate(new Date()));
  const preview = data.movements.slice(0, 4);

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-finance-balance">
      {/* Money hero */}
      <section className="soft-card p-4 sm:p-5">
        <p className="text-xs text-[var(--soft-ink-soft)]">Доступно к выплате</p>
        <p className="mt-1 font-heading text-3xl font-bold tabular-nums text-[var(--soft-bordeaux)]">
          {data.currentBalance.toLocaleString("ru")} ₽
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
          Оборот {data.totalRevenue.toLocaleString("ru")} ₽ − комиссия {data.totalFee.toLocaleString("ru")} ₽ по
          ставкам завершённых сессий = {data.accruedNet.toLocaleString("ru")} ₽ чистыми. Начислено по завершённым
          сессиям; та же цифра — в шапке кабинета.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: "#F6E7DD", color: "var(--soft-bordeaux)" }}>
            выплата {nextPayout}
          </span>
        </div>
        {/* «Удержано» — только hold по сессиям; ведёт в «Движение средств». */}
        {data.heldPayout > 0 && (
          <Link
            href={appUrl("/practitioner/finance/movements?filter=holds")}
            data-testid="practitioner-finance-held"
            className="mt-3 flex items-center gap-2 rounded-[12px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]/50 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--soft-paper-deep)]"
          >
            <span className="min-w-0 flex-1">
              <span className="font-medium">Удержано {data.heldPayout.toLocaleString("ru")} ₽</span>
              <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">
                Hold по сессиям · снимется после периода удержания → в «Движении средств»
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
          </Link>
        )}
      </section>

      {/* 4 totals */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { v: `${data.monthNet.toLocaleString("ru")} ₽`, k: "этот месяц · чистыми" },
          { v: String(data.monthCount), k: `сессий · ${data.monthKey.split(" ")[0]}` },
          { v: `${data.accruedNet.toLocaleString("ru")} ₽`, k: "всего заработано" },
          { v: `${data.paidOut.toLocaleString("ru")} ₽`, k: "уже выплачено" },
        ].map((s) => (
          <div key={s.k} className="soft-card p-3.5">
            <p className="font-heading text-lg leading-tight text-[var(--soft-bordeaux)]">{s.v}</p>
            <p className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">{s.k}</p>
          </div>
        ))}
      </div>

      {/* Movements preview */}
      <section>
        <div className="mb-2.5 flex items-baseline justify-between">
          <p className="soft-eyebrow">Движение средств</p>
          <Link href={appUrl("/practitioner/finance/movements")} className="text-xs text-[var(--soft-terracotta-dark)]">
            всё →
          </Link>
        </div>
        <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          {preview.length === 0 ? (
            <p className="px-4 py-5 text-sm text-[var(--soft-ink-faint)]">Движений пока нет — они появятся после первой завершённой сессии</p>
          ) : (
            preview.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{m.label}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--soft-ink-faint)]">{m.sublabel}</p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    m.kind === "earning" ? "text-[var(--soft-sage-ink,#4B6146)]" : m.kind === "hold" ? "text-[var(--soft-amber-ink,#6E5114)]" : "text-[var(--soft-ink-soft)]"
                  }`}
                >
                  {m.kind === "earning" ? "+" : "−"}{m.amountRub.toLocaleString("ru")} ₽
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Payout schedule note */}
      <section className="soft-card p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]" data-testid="practitioner-finance-schedule">
        <p className="mb-1 font-medium text-foreground">График выплат</p>
        Дважды в месяц — <span className="text-foreground">1-го и 15-го по МСК</span>. Деньги за сессию доступны
        после периода удержания по вашему тарифу:{" "}
        <span className="text-foreground">{practitionerTierName(tier)} — {holdDays} {holdDays === 1 ? "день" : holdDays < 5 ? "дня" : "дней"}</span>{" "}
        (Pro+ 1 день, Pro 3 дня, Базовый 7 дней). Спорные сессии удерживаются до разрешения. Следующая дата:{" "}
        <span className="text-foreground">{nextPayout}</span>.
      </section>

      {/* By month */}
      {data.byMonth.length > 0 && (
        <section>
          <p className="soft-eyebrow mb-2.5">По месяцам</p>
          <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
            {data.byMonth.map((m) => (
              <div key={m.month} className="flex items-center gap-3 px-3.5 py-3 text-sm">
                <span className="min-w-0 flex-1 capitalize">{m.month}</span>
                <span className="shrink-0 text-xs text-[var(--soft-ink-faint)]">{m.count} сессий</span>
                <span className="w-28 shrink-0 text-right font-medium tabular-nums text-[var(--soft-sage-ink,#4B6146)]">
                  {m.net.toLocaleString("ru")} ₽
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
