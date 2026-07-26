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

/**
 * B582 (owner 2026-07-26): регистр запроса, а не только тема.
 *
 * Что было. Подбор формата смотрел ТОЛЬКО на тему (отношения/работа/деньги…),
 * а тема одна и та же у «он меня не слышит» и у «вернётся ли он». Поэтому
 * человеку с эзотерическим запросом предлагались «Переосмысление» и «Разбор
 * ситуации» — психологические форматы. Живой случай: вопрос «Буду ли я жить в
 * этой стране» получил ответ психолога и психологические рекомендации.
 *
 * Побочно вскрылось: `horary` («Хорарная астрология» — прямой ответ по карте
 * момента на ОДИН вопрос) не рекомендовался ни одной воронкой, хотя это ровно
 * тот формат, который отвечает на вопрос вида «буду ли я…». Продукт есть,
 * цена есть, входа в него из разбора не было.
 */
export type RecommendationRegister = "symbolic" | "psychological";

const SYMBOLIC_PRIMARY: Record<DialogueTopic, V5ProductSlug> = {
  // Вопрос про конкретного человека и «что будет» — карта момента отвечает
  // прямо, остальные форматы отвечают вокруг.
  relationships: "horary",
  family: "family-scenarios",
  career: "horary",
  money: "horary",
  anxiety: "natal-chart",
  self: "natal-chart",
  other: "horary",
};

const SYMBOLIC_ADJACENT: Record<DialogueTopic, V5ProductSlug[]> = {
  relationships: ["tarot", "synastry", "natal-chart", "tarot-numerology"],
  family: ["tarot", "natal-chart", "surname-story", "numerology"],
  career: ["tarot", "natal-chart", "numerology", "human-design"],
  money: ["tarot", "numerology", "natal-chart", "human-design"],
  anxiety: ["tarot", "human-design", "numerology", "tarot-numerology"],
  self: ["human-design", "tarot-numerology", "numerology", "tarot"],
  other: ["tarot", "natal-chart", "numerology", "human-design"],
};

const SYMBOLIC_PRIMARY_REASON: Record<DialogueTopic, string> = {
  relationships: "Один вопрос про эти отношения — и прямой ответ по карте момента, с условиями и противоречиями.",
  family: "Разбор семейного сюжета: какая роль вам досталась и что повторяется из поколения в поколение.",
  career: "Один вопрос о работе — прямой ответ по карте момента: да, нет, пока нет или условно.",
  money: "Один денежный вопрос — прямой ответ по карте момента, с препятствиями и условиями изменения.",
  anxiety: "Натальная карта покажет, где ваша тревога опирается на устройство, а не на случайность.",
  self: "Натальная карта — про устройство: сильные места, дефициты и то, что вы принимали за поломку.",
  other: "Один точный вопрос получает прямой ответ по карте момента, с условиями и противоречиями.",
};

/**
 * «Мостик» в другую семью форматов — ОДИН и всегда последним.
 *
 * Смешивание нужно (owner), но не в равных долях: человек пришёл с конкретным
 * языком, и первым ему должно отвечать то, что он просил. Поэтому основной
 * формат всегда из его регистра, соседние — тоже, и лишь замыкающий пункт
 * показывает соседнюю полку. Так эзотерический запрос видит и «Переосмысление»,
 * а психологический — «Таро», но ни один не подменяется другим.
 */
const BRIDGE_PRODUCT: Record<RecommendationRegister, V5ProductSlug> = {
  symbolic: "reframe",
  psychological: "tarot",
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

export function recommendPrimaryProduct(
  topic: string | null | undefined,
  register: RecommendationRegister = "psychological",
): ProductRecommendation {
  const t = normalizeTopic(topic);
  const rec = register === "symbolic"
    ? toRecommendation(SYMBOLIC_PRIMARY[t], SYMBOLIC_PRIMARY_REASON[t])
    : toRecommendation(PRIMARY_PRODUCT[t], PRIMARY_REASON[t]);
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
  register: RecommendationRegister = "psychological",
): ProductRecommendation {
  const primary = recommendPrimaryProduct(topic, register);
  if (primary.slug !== excludeSlug) return primary;
  const [fallback] = recommendSecondaryProducts(topic, excludeSlug, 1, register);
  return fallback ?? primary;
}

export function recommendSecondaryProducts(
  topic: string | null | undefined,
  excludeSlug: string,
  limit = 3,
  register: RecommendationRegister = "psychological",
): ProductRecommendation[] {
  const t = normalizeTopic(topic);
  const family = register === "symbolic" ? SYMBOLIC_ADJACENT[t] : ADJACENT_PRODUCTS[t];
  const bridge = BRIDGE_PRODUCT[register];

  const seen = new Set<string>([excludeSlug]);
  const out: ProductRecommendation[] = [];
  const push = (slug: V5ProductSlug) => {
    if (seen.has(slug)) return;
    const product = getV5Product(slug);
    if (!product) return;
    seen.add(slug);
    out.push({
      slug: product.slug,
      name: product.name,
      href: product.route,
      reason: product.summary,
      price: product.price,
      creditCost: product.creditCost,
    });
  };

  // Мостик резервирует ПОСЛЕДНЕЕ место, поэтому из своей семьи берём на один
  // меньше. Иначе он не попадал бы в выдачу вовсе: семей на 4 позиции хватает,
  // а лимит обычно 3. При limit=1 мостика нет — единственное место отдаётся
  // формату СВОЕГО регистра, а не чужого.
  const familyQuota = limit > 1 && !seen.has(bridge) ? limit - 1 : limit;
  for (const slug of family) {
    if (out.length >= familyQuota) break;
    push(slug);
  }
  if (out.length < limit) push(bridge);
  // Мостик мог оказаться исключённым (exclude) или уже быть в семье — тогда
  // добираем своим регистром, чтобы не отдать список короче запрошенного.
  for (const slug of family) {
    if (out.length >= limit) break;
    push(slug);
  }
  return out;
}
