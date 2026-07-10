import db from "@/lib/db";
import {
  BYOC_LADDER,
  FOUNDING_FLAT_COMMISSION,
  PLATFORM_COMMISSION_BY_TIER,
} from "@/lib/practitioner-commission";
import { AI_ANALYSES_INCLUDED } from "@/lib/practitioner-ai-quota";
import { V5_SUBSCRIPTION_PLANS } from "@/lib/entitlements";
import { computePractitionerBalance } from "@/lib/practitioner-balance";
import type { PractitionerTier } from "@/lib/practitioner-tier";
import { TariffPlans } from "./tariff-plans";

// B466 — «Финансы → Тариф» (mockup practitioner-finance-tariff): commission
// hero for the CURRENT tier, 3-plan comparison (current marked, Pro+ = the
// highlighted upgrade, NO free trial), BYOC lever. AI-разборы are METERED
// (B434): Pro 20 / Pro+ 50 в месяц + докупка пакетами.

const TIER_TO_COMMISSION_KEY = {
  free: "base",
  pro: "practitioner_pro",
  pro_plus: "practitioner_pro_plus",
} as const;

export async function TariffTab({
  tier,
  practitionerId,
  userId,
}: {
  tier: PractitionerTier;
  practitionerId: string;
  userId: string;
}) {
  const [subscription, balance] = await Promise.all([
    db.userSubscription.findFirst({
      where: {
        userId,
        planKey: { in: ["practitioner_pro", "practitioner_pro_plus"] },
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, planKey: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
    computePractitionerBalance(practitionerId),
  ]);

  const commissionKey = TIER_TO_COMMISSION_KEY[tier];
  const platformPct = PLATFORM_COMMISSION_BY_TIER[commissionKey];
  const byocPct = BYOC_LADDER[commissionKey];
  const earningsBalanceRub = Math.max(0, balance?.currentBalance ?? 0);

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-finance-tariff">
      {/* Commission hero */}
      <section
        className="rounded-[18px] p-4 text-[#FBF1E4] sm:p-5"
        style={{ background: "linear-gradient(135deg, var(--soft-bordeaux), #8a3d3d)" }}
        data-testid="practitioner-commission-hero"
      >
        <p className="text-[11px] uppercase tracking-[0.12em] opacity-80">
          Ваша комиссия на тарифе {tier === "free" ? "Базовый" : tier === "pro" ? "Pro" : "Pro+"}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="font-heading text-3xl font-semibold" style={{ color: "#FBF1E4" }}>{platformPct}%</p>
            <p className="mt-0.5 text-xs opacity-80">клиенты платформы</p>
          </div>
          <div>
            <p className="font-heading text-3xl font-semibold" style={{ color: "#FBF1E4" }}>{byocPct}%</p>
            <p className="mt-0.5 text-xs opacity-80">свои клиенты по ссылке</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed opacity-80">
          {tier === "pro_plus"
            ? "У вас минимальная комиссия платформы."
            : `На Pro+ комиссия ниже — ${PLATFORM_COMMISSION_BY_TIER.practitioner_pro_plus}% / ${BYOC_LADDER.practitioner_pro_plus}%.`}{" "}
          Расшифровка и комплаенс — за счёт платформы на всех тарифах.
        </p>
      </section>

      {/* Plans */}
      <section>
        <p className="soft-eyebrow mb-2.5">Сравнение тарифов</p>
        <TariffPlans
          tier={tier}
          earningsBalanceRub={earningsBalanceRub}
          subscription={
            subscription
              ? {
                  id: subscription.id,
                  planKey: subscription.planKey,
                  currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
                  cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                }
              : null
          }
          prices={{
            pro: Math.round(V5_SUBSCRIPTION_PLANS.practitioner_pro.amountKopecks / 100),
            proPlus: Math.round(V5_SUBSCRIPTION_PLANS.practitioner_pro_plus.amountKopecks / 100),
          }}
          aiIncluded={{ pro: AI_ANALYSES_INCLUDED.pro, proPlus: AI_ANALYSES_INCLUDED.pro_plus }}
        />
      </section>

      {/* BYOC lever */}
      <section className="soft-card p-4 sm:p-5" data-testid="practitioner-byoc-lever">
        <p className="text-[15px] font-semibold">Приводите своих клиентов — комиссия ниже</p>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Клиенты по вашей реферальной ссылке считаются «своими»: на Pro комиссия{" "}
          <span className="font-semibold text-[var(--soft-bordeaux)]">{BYOC_LADDER.practitioner_pro}%</span> вместо{" "}
          {PLATFORM_COMMISSION_BY_TIER.practitioner_pro}% (Pro+ — {BYOC_LADDER.practitioner_pro_plus}%). Первым 150
          практикам — <span className="font-semibold text-[var(--soft-bordeaux)]">{FOUNDING_FLAT_COMMISSION}%</span> на год.
        </p>
      </section>
    </div>
  );
}
