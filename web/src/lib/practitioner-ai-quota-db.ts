// B466/B434 — db read model for the practitioner AI-разбор quota. Split from
// practitioner-ai-quota.ts (pure math) so client components can import the
// math/constants without pulling the Prisma client into the bundle.

import { getActivePractitionerPlanKey } from "@/lib/practitioner-entitlements";
import { practitionerTierFromPlanKey } from "@/lib/practitioner-tier";
import { getAnalysesUsedThisMonth, getTopupBalance } from "@/lib/practitioner-ai-metering";
import { computeAiQuota, type PractitionerAiQuota } from "@/lib/practitioner-ai-quota";

/**
 * Квота из ledger'а B434: использовано = строки PractitionerAiAnalysis за
 * текущий МСК-месяц; докупленный пул = покупки пакетов минус topup-списания.
 */
export async function getPractitionerAiQuota(
  practitionerId: string,
  userId: string,
  now: Date = new Date(),
): Promise<PractitionerAiQuota> {
  const [planKey, usedThisMonth, topupUnits] = await Promise.all([
    getActivePractitionerPlanKey(userId),
    getAnalysesUsedThisMonth(practitionerId, now),
    getTopupBalance(practitionerId),
  ]);
  return computeAiQuota({
    tier: practitionerTierFromPlanKey(planKey),
    usedThisMonth,
    topupBalance: topupUnits,
    now,
  });
}
