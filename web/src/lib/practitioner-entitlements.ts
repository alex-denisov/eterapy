import type { Prisma } from "@prisma/client";
import db from "@/lib/db";

export type PractitionerFeature = "browser_stt" | "session_summary" | "server_stt";
export type PractitionerFeaturePlanKey = "practitioner_pro" | "practitioner_pro_plus";

const PRACTITIONER_FEATURE_PLANS: Record<PractitionerFeature, PractitionerFeaturePlanKey[]> = {
  browser_stt: ["practitioner_pro", "practitioner_pro_plus"],
  session_summary: ["practitioner_pro", "practitioner_pro_plus"],
  server_stt: ["practitioner_pro", "practitioner_pro_plus"],
};

// B466 (утверждённая матрица 23 июня): «Расшифровка + комплаенс (платформа)» —
// ✓ на ВСЕХ тарифах; стоимость STT покрывается комиссией, а не тариф-гейтом.
// Метерится только AI-разбор (см. practitioner-ai-metering).
const FEATURES_FOR_ALL_TIERS: ReadonlySet<PractitionerFeature> = new Set(["server_stt"]);

type PractitionerEntitlementTx = Pick<Prisma.TransactionClient, "userSubscription">;

export function getPractitionerFeaturePlanKeys(feature: PractitionerFeature): PractitionerFeaturePlanKey[] {
  return [...PRACTITIONER_FEATURE_PLANS[feature]];
}

export async function practitionerHasFeature(
  userId: string,
  feature: PractitionerFeature,
  tx: PractitionerEntitlementTx = db,
  now = new Date(),
) {
  if (FEATURES_FOR_ALL_TIERS.has(feature)) return true;
  const subscription = await tx.userSubscription.findFirst({
    where: {
      userId,
      planKey: { in: PRACTITIONER_FEATURE_PLANS[feature] },
      status: { in: ["TRIALING", "ACTIVE"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    select: { id: true, planKey: true },
  });

  return Boolean(subscription);
}

export async function getActivePractitionerPlanKey(
  userId: string,
  tx: PractitionerEntitlementTx = db,
  now = new Date(),
): Promise<PractitionerFeaturePlanKey | null> {
  const subscriptions = await tx.userSubscription.findMany({
    where: {
      userId,
      planKey: { in: ["practitioner_pro", "practitioner_pro_plus"] },
      status: { in: ["TRIALING", "ACTIVE"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    select: { planKey: true },
  });
  const planKeys = subscriptions.map((subscription) => subscription.planKey);
  if (planKeys.includes("practitioner_pro_plus")) return "practitioner_pro_plus";
  if (planKeys.includes("practitioner_pro")) return "practitioner_pro";
  return null;
}

export async function getPractitionerSessionRetentionDays(
  userId: string,
  tx: PractitionerEntitlementTx = db,
  now = new Date(),
) {
  const planKey = await getActivePractitionerPlanKey(userId, tx, now);
  if (planKey === "practitioner_pro_plus") return 90;
  if (planKey === "practitioner_pro") return 30;
  return null;
}
