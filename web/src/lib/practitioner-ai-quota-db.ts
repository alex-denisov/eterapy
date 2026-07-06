// B466/B434 — db read model for the practitioner AI-разбор quota. Split from
// practitioner-ai-quota.ts (pure math) so client components can import the
// math/constants without pulling the Prisma client into the bundle.

import db from "@/lib/db";
import { getActivePractitionerPlanKey } from "@/lib/practitioner-entitlements";
import { practitionerTierFromPlanKey } from "@/lib/practitioner-tier";
import {
  computeAiQuota,
  mskMonthRange,
  type PractitionerAiQuota,
} from "@/lib/practitioner-ai-quota";

/**
 * Использовано в месяце = сессии практика, по которым сгенерирован AI-разбор
 * (summaryText) в текущем месяце МСК. Докупленный пул придёт с ledger'ом B434
 * (top-up покупки); до первых покупок он равен нулю.
 */
export async function getPractitionerAiQuota(
  practitionerId: string,
  userId: string,
  now: Date = new Date(),
): Promise<PractitionerAiQuota> {
  const { start, end } = mskMonthRange(now);
  const [planKey, usedThisMonth, topupUnits] = await Promise.all([
    getActivePractitionerPlanKey(userId),
    db.videoSession.count({
      where: {
        summaryText: { not: null },
        createdAt: { gte: start, lt: end },
        booking: { practitionerId },
      },
    }),
    getPractitionerTopupBalance(practitionerId),
  ]);
  return computeAiQuota({
    tier: practitionerTierFromPlanKey(planKey),
    usedThisMonth,
    topupBalance: topupUnits,
    now,
  });
}

/**
 * НЕТТО-остаток докупленных разборов. Покупки пишутся в Transaction с
 * metadata.purchaseKind = "practitioner_ai_topup" (units); списания сверх
 * включённой квоты учитываются счётчиком overflow-разборов за всё время.
 */
export async function getPractitionerTopupBalance(practitionerId: string): Promise<number> {
  void practitionerId;
  // B434 ledger: покупки пакетов появятся вместе с экраном «Разборы и AI»
  // (Phase 5). До этого докупленного пула не существует.
  return 0;
}
