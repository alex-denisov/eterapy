import type { Prisma } from "@prisma/client";
import db from "@/lib/db";

export type PractitionerFeature = "browser_stt" | "session_summary" | "server_stt";
export type PractitionerFeaturePlanKey = "practitioner_pro" | "practitioner_pro_plus";

const PRACTITIONER_FEATURE_PLANS: Record<PractitionerFeature, PractitionerFeaturePlanKey[]> = {
  browser_stt: ["practitioner_pro", "practitioner_pro_plus"],
  session_summary: ["practitioner_pro", "practitioner_pro_plus"],
  server_stt: ["practitioner_pro_plus"],
};

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
