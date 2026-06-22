// Client-safe product recommendation logic (topic → primary product + adjacent
// «другие форматы»). Split out of dialogue-recommendations so CLIENT components
// (chat-analysis, tarot triage) can use it without dragging entitlements → db →
// pg into the browser bundle. dialogue-recommendations re-exports these.
import { getV5Product, type V5ProductSlug } from "@/lib/v5-products";

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

const TOPICS: DialogueTopic[] = ["relationships", "family", "career", "money", "anxiety", "self", "other"];

// B373 (M26): выпиленные услуги убраны из рекомендаций — воронка ведёт только на
// живые продукты, чтобы не упереться в 404.
const PRIMARY_PRODUCT: Record<DialogueTopic, V5ProductSlug> = {
  relationships: "pair",
  family: "pair",
  career: "reframe",
  money: "deep-report",
  anxiety: "deep-report",
  self: "reframe",
  other: "reframe",
};

const ADJACENT_PRODUCTS: Record<DialogueTopic, V5ProductSlug[]> = {
  relationships: ["pair", "chat-analysis", "reframe", "tarot"],
  family: ["reframe", "chat-analysis", "pair", "family-scenarios"],
  career: ["reframe", "deep-report", "numerology", "tarot"],
  money: ["deep-report", "reframe", "numerology", "tarot"],
  anxiety: ["deep-report", "reframe", "tarot", "natal-chart"],
  self: ["reframe", "natal-chart", "human-design", "tarot"],
  other: ["reframe", "deep-report", "tarot", "numerology"],
};

const PRIMARY_REASON: Record<DialogueTopic, string> = {
  relationships: "Вы можете отдельно сравнить взгляды друг друга — общий итог откроется по согласию.",
  family: "Бережный групповой формат, чтобы услышать близких без давления и спора.",
  career: "Переосмыслим решение: мысли против фактов, чувства, другой взгляд и первый шаг.",
  money: "Структурируем варианты, риски и безопасные шаги в подробный документ-разбор.",
  anxiety: "Структурируем тревожную ситуацию: что здесь факт, а что страх, и какие шаги безопасны.",
  self: "Посмотрим на ситуацию иначе — мысли, чувства, другой взгляд и первый шаг.",
  other: "Метод когнитивного рефрейминга: увидеть ситуацию под четырьмя углами сразу.",
};

export function normalizeTopic(topic: string | null | undefined): DialogueTopic {
  if (topic && (TOPICS as string[]).includes(topic)) return topic as DialogueTopic;
  return "other";
}

// B443: самодостаточные услуги (reframe, deep-report) собирают контекст RU-чипами
// (работа/отношения/семья/…). Маппинг на канонические DialogueTopic, чтобы воронка
// «что вам подойдет» подбирала продукт по теме. Незнакомый чип → normalizeTopic.
const RU_CHIP_TO_TOPIC: Record<string, DialogueTopic> = {
  "работа": "career",
  "отношения": "relationships",
  "семья": "family",
  "сам(а) с собой": "self",
  "здоровье": "anxiety",
  "деньги": "money",
  "другое": "other",
};

export function dialogueTopicFromChip(chip: string | null | undefined): DialogueTopic {
  if (!chip) return "other";
  return RU_CHIP_TO_TOPIC[chip] ?? normalizeTopic(chip);
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
  return rec ?? {
    slug: "reframe",
    name: "Переосмысление",
    href: "/products/reframe",
    reason: PRIMARY_REASON.other,
    price: "299 ₽",
    creditCost: 1,
  };
}

// B443: «что вам подойдет» на экране результата услуги не должна рекомендовать ту
// же услугу, которую человек только что прошёл. Если основной продукт темы
// совпал с текущим — берём первый смежный формат как primary.
export function recommendPrimaryProductExcluding(
  topic: string | null | undefined,
  excludeSlug: string,
): ProductRecommendation {
  const primary = recommendPrimaryProduct(topic);
  if (primary.slug !== excludeSlug) return primary;
  const [fallback] = recommendSecondaryProducts(topic, excludeSlug, 1);
  return fallback ?? primary;
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
