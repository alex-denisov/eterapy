import { UserPlus } from "lucide-react";
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
import { TariffPlansMobile } from "./tariff-plans-mobile";

// B466 R9-4 P4 — мобильный «Тариф» 1-в-1 по mockup -finance-tariff: commission
// hero текущего тарифа → сравнение планов (TariffPlansMobile) → рычаг «свои
// клиенты». Выборки те же, что и десктопный TariffTab (двойная выборка при
// активной вкладке — осознанный трейд-офф до R9-5, как в P2/P3).

const TIER_TO_COMMISSION_KEY = {
  free: "base",
  pro: "practitioner_pro",
  pro_plus: "practitioner_pro_plus",
} as const;

export async function FinanceTariffMobile({
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
  const tierName = tier === "free" ? "Базовый" : tier === "pro" ? "Pro" : "Pro+";

  return (
    <div data-testid="practitioner-finance-tariff-mobile">
      {/* commission hero */}
      <section className="pcab-section">
        <div className="pcab-comm">
          <div className="pcab-comm-k">Ваша комиссия на тарифе {tierName}</div>
          <div className="pcab-comm-row">
            <div>
              <div className="pcab-comm-v">
                {platformPct}
                <small>%</small>
              </div>
              <div className="pcab-comm-sub" style={{ marginTop: 4 }}>клиенты платформы</div>
            </div>
            <div className="pcab-comm-sep" />
            <div>
              <div className="pcab-comm-v">
                {byocPct}
                <small>%</small>
              </div>
              <div className="pcab-comm-sub" style={{ marginTop: 4 }}>свои клиенты по ссылке</div>
            </div>
          </div>
          <div className="pcab-comm-sub">
            {tier === "pro_plus"
              ? "У вас минимальная комиссия платформы."
              : `На Pro+ комиссия ниже — ${PLATFORM_COMMISSION_BY_TIER.practitioner_pro_plus}% / ${BYOC_LADDER.practitioner_pro_plus}%.`}{" "}
            Расшифровка и комплаенс — за счёт платформы на всех тарифах.
          </div>
        </div>
      </section>

      {/* планы */}
      <section className="pcab-section">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Сравнение тарифов</span>
        </div>
        <TariffPlansMobile
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

      {/* привод своих клиентов */}
      <section className="pcab-section">
        <div className="pcab-byoc">
          <span className="pcab-byoc-ic">
            <UserPlus size={19} aria-hidden="true" />
          </span>
          <div>
            <div className="pcab-byoc-t">Приводите своих клиентов — комиссия ниже</div>
            <div className="pcab-byoc-s">
              Клиенты по вашей реферальной ссылке считаются «своими»: на Pro комиссия{" "}
              <b>{BYOC_LADDER.practitioner_pro}%</b> вместо {PLATFORM_COMMISSION_BY_TIER.practitioner_pro}% (Pro+ —{" "}
              {BYOC_LADDER.practitioner_pro_plus}%). Первым 150 практикам — <b>{FOUNDING_FLAT_COMMISSION}%</b> на год.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
