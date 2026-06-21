/**
 * W17: the dialogue-result recommendation engine.
 *
 * Fixes three long-standing defects on the /checkin result page:
 *   1. the recommended PRODUCT never matched the user's topic (the UI hard-coded
 *      "Полная картина"); now it is derived from the classified topic + catalog,
 *   2. the "другие форматы" list was a static 5-item array (same for everyone);
 *      now it is topic-adjacent and excludes the primary recommendation,
 *   3. the subscription nudge was always "Plus / 490 ₽"; now the tier is chosen
 *      by whether the recommended product is bundled in Plus vs Premium, and is
 *      suppressed for free products / sessions / already-subscribed users.
 *
 * Practitioner variety lives in the API route (taxonomy overlap + a
 * deterministic per-dialogue rotation), but the topic→category map is here so
 * both layers share one source of truth.
 */
import { V5_SUBSCRIPTION_PLANS } from "@/lib/entitlements";
import type { CategoryId } from "@/lib/practitioner-taxonomy";
import type { DialogueTopic } from "@/lib/product-format-recommendations";

// Product recommendations live in the client-safe module (no entitlements/db);
// re-export them so existing importers of this module keep working.
export {
  normalizeTopic,
  recommendPrimaryProduct,
  recommendSecondaryProducts,
} from "@/lib/product-format-recommendations";
export type { DialogueTopic, ProductRecommendation } from "@/lib/product-format-recommendations";

export interface SubscriptionRecommendation {
  tier: "plus" | "premium";
  name: string;
  priceRub: number;
  reason: string;
}

/**
 * Topic → practitioner specializations (W3 categories) used to score humans.
 * Lets a "money" question surface a financial coach, not the top-reviewed tarot
 * reader.
 */
export const TOPIC_CATEGORIES: Record<DialogueTopic, CategoryId[]> = {
  relationships: ["psychology", "esoteric"],
  family: ["psychology", "legal"],
  career: ["coaching", "psychology"],
  money: ["finance", "coaching"],
  anxiety: ["psychology"],
  self: ["psychology", "coaching", "esoteric"],
  other: ["psychology"],
};

/**
 * Choose which subscription tier (if any) to surface as a calm bundle note.
 * Plus when the recommended product is in the Plus bundle; Premium when it is
 * Premium-only; nothing for free products, sessions, or current subscribers.
 */
export function recommendSubscription(
  primarySlug: string,
  hasActiveSubscription: boolean,
): SubscriptionRecommendation | null {
  if (hasActiveSubscription) return null;

  const plus = V5_SUBSCRIPTION_PLANS.plus;
  const premium = V5_SUBSCRIPTION_PLANS.premium;

  if ((plus.includedProducts as string[]).includes(primarySlug)) {
    return {
      tier: "plus",
      name: plus.name,
      priceRub: Math.round(plus.amountKopecks / 100),
      reason: `В ${plus.name} этот формат включён и +${plus.creditsPerPeriod} баллов каждый месяц`,
    };
  }
  if ((premium.includedProducts as string[]).includes(primarySlug)) {
    return {
      tier: "premium",
      name: premium.name,
      priceRub: Math.round(premium.amountKopecks / 100),
      reason: `В ${premium.name} входит этот формат и ещё ${premium.includedProducts.length - 1} + ${premium.creditsPerPeriod} баллов`,
    };
  }
  // X17: for free/unmatched products the nudge no longer disappears entirely —
  // we surface Plus as the calm entry tier (still suppressed for subscribers
  // above). The product itself isn't bundled, so we frame it as «возвращаться».
  return {
    tier: "plus",
    name: plus.name,
    priceRub: Math.round(plus.amountKopecks / 100),
    reason: `Если планируете возвращаться — в ${plus.name} +${plus.creditsPerPeriod} баллов каждый месяц и доступ к маршрутам`,
  };
}

/** Stable 32-bit hash (FNV-1a) for deterministic per-dialogue rotation. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
