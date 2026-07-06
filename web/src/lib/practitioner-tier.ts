// B466 — practitioner tariff tier, derived from the active subscription plan
// key. Pure data helpers (no db/server imports) so both server pages and
// client components can share the same tier naming.

export type PractitionerTier = "free" | "pro" | "pro_plus";

export function practitionerTierFromPlanKey(planKey: string | null | undefined): PractitionerTier {
  if (planKey === "practitioner_pro_plus") return "pro_plus";
  if (planKey === "practitioner_pro") return "pro";
  return "free";
}

/** Short badge label shown next to the practitioner's name (mockup: PRO / PRO+). */
export function practitionerTierBadge(tier: PractitionerTier): string {
  if (tier === "pro_plus") return "PRO+";
  if (tier === "pro") return "PRO";
  return "Базовый";
}

/** Full tariff name used on the Финансы «Тариф» tab. */
export function practitionerTierName(tier: PractitionerTier): string {
  if (tier === "pro_plus") return "Pro+";
  if (tier === "pro") return "Pro";
  return "Базовый";
}
