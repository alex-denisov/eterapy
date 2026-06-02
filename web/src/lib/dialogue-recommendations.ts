/**
 * W17: the dialogue-result recommendation engine.
 *
 * Fixes three long-standing defects on the /checkin result page:
 *   1. the recommended PRODUCT never matched the user's topic (the UI hard-coded
 *      "4 ракурса"); now it is derived from the classified topic + catalog,
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
import { getV5Product, type V5ProductSlug } from "@/lib/v5-products";
import { V5_SUBSCRIPTION_PLANS } from "@/lib/entitlements";
import type { CategoryId } from "@/lib/practitioner-taxonomy";

export type DialogueTopic =
  | "relationships" | "family" | "career" | "money" | "anxiety" | "self" | "other";

export interface ProductRecommendation {
  slug: string;
  name: string;
  href: string;
  reason: string;
  price: string;
  creditCost: number | null;
}

export interface SubscriptionRecommendation {
  tier: "plus" | "premium";
  name: string;
  priceRub: number;
  reason: string;
}

const TOPICS: DialogueTopic[] = ["relationships", "family", "career", "money", "anxiety", "self", "other"];

/** Topic → the single most relevant next product. */
const PRIMARY_PRODUCT: Record<DialogueTopic, V5ProductSlug> = {
  relationships: "compatibility",
  family: "circle",
  career: "perspectives",
  money: "deep-report",
  anxiety: "seven-days",
  self: "clarity-practice",
  other: "perspectives",
};

/** Topic → adjacent products (variety pool; the primary is filtered out). */
const ADJACENT_PRODUCTS: Record<DialogueTopic, V5ProductSlug[]> = {
  relationships: ["pair", "chat-analysis", "compatibility", "tarot"],
  family: ["circle", "compatibility", "pair", "my-map"],
  career: ["perspectives", "deep-report", "seven-days", "numerology"],
  money: ["deep-report", "perspectives", "seven-days", "numerology"],
  anxiety: ["seven-days", "clarity-practice", "perspectives", "tarot"],
  self: ["clarity-practice", "perspectives", "my-map", "tarot"],
  other: ["perspectives", "deep-report", "tarot", "my-map"],
};

/** Topic → reason copy shown on the primary product card. */
const PRIMARY_REASON: Record<DialogueTopic, string> = {
  relationships: "Вы можете отдельно сравнить взгляды друг друга — общий итог откроется по согласию.",
  family: "Бережный групповой формат, чтобы услышать близких без давления и спора.",
  career: "Разложим ваше решение на разум, чувства, символ и действие — где ответ уже виден.",
  money: "Структурируем варианты, риски и безопасные шаги в подробный документ-разбор.",
  anxiety: "Короткие ежедневные шаги, чтобы тревога не управляла днём.",
  self: "Регулярный ритм возвращения к себе — без давления и без срочности.",
  other: "Универсальное углубление: посмотрим на ситуацию с четырёх сторон сразу.",
};

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

export function normalizeTopic(topic: string | null | undefined): DialogueTopic {
  if (topic && (TOPICS as string[]).includes(topic)) return topic as DialogueTopic;
  return "other";
}

function toRecommendation(slug: V5ProductSlug, reason: string): ProductRecommendation | null {
  const product = getV5Product(slug);
  if (!product) return null;
  return {
    slug: product.slug,
    name: product.name,
    href: product.route,
    reason,
    price: product.price,
    creditCost: product.creditCost,
  };
}

export function recommendPrimaryProduct(topic: string | null | undefined): ProductRecommendation {
  const t = normalizeTopic(topic);
  const rec = toRecommendation(PRIMARY_PRODUCT[t], PRIMARY_REASON[t]);
  // perspectives always resolves, so the non-null assertion is safe; keep a
  // defensive fallback anyway.
  return rec ?? {
    slug: "perspectives",
    name: "4 ракурса ответа",
    href: "/products/perspectives",
    reason: PRIMARY_REASON.other,
    price: "299 ₽",
    creditCost: 1,
  };
}

export function recommendSecondaryProducts(
  topic: string | null | undefined,
  excludeSlug: string,
  limit = 3,
): ProductRecommendation[] {
  const t = normalizeTopic(topic);
  const out: ProductRecommendation[] = [];
  for (const slug of ADJACENT_PRODUCTS[t]) {
    if (slug === excludeSlug) continue;
    const product = getV5Product(slug);
    if (!product) continue;
    out.push({
      slug: product.slug,
      name: product.name,
      href: product.route,
      reason: product.summary,
      price: product.price,
      creditCost: product.creditCost,
    });
    if (out.length >= limit) break;
  }
  return out;
}

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
      reason: `В ${plus.name} этот формат включён и +${plus.creditsPerPeriod} кредитов ясности каждый месяц`,
    };
  }
  if ((premium.includedProducts as string[]).includes(primarySlug)) {
    return {
      tier: "premium",
      name: premium.name,
      priceRub: Math.round(premium.amountKopecks / 100),
      reason: `В ${premium.name} входит этот формат и ещё ${premium.includedProducts.length - 1} + ${premium.creditsPerPeriod} кредитов`,
    };
  }
  // free product / group format / session → no subscription pressure
  return null;
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
