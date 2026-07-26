// B382 (M26): library taxonomy (7 life themes) + topic→service CTA funnel.
// Client-safe: derives credits/₽ from product-prices.ts (B366 single source of
// truth), so a card CTA can never drift from the product page price.

import { formatPoints } from "@/lib/points";
import { getProductCreditCost, getProductPriceLabel } from "@/lib/product-prices";

export type LifeLibraryTopic =
  | "Отношения"
  | "Повторяется одно и то же"
  | "Тревога и состояние"
  | "Работа и деньги"
  | "Одиночество"
  | "Выбор и решения"
  | "Про себя";

export type SymbolicLibraryTopic =
  | "Сны и символы"
  | "Таро"
  | "Матрица судьбы"
  | "Натальная карта"
  | "Совместимость"
  | "Имя и фамилия";

export type LibraryTopic = LifeLibraryTopic | SymbolicLibraryTopic;

// Catalog/filter order — life-stage flow, not alphabetical. The "Паттерны" label
// is intentionally gone (renamed «Повторяется одно и то же» per M26 spec table).
export const LIFE_LIBRARY_TOPICS: readonly LifeLibraryTopic[] = [
  "Отношения",
  "Повторяется одно и то же",
  "Тревога и состояние",
  "Работа и деньги",
  "Одиночество",
  "Выбор и решения",
  "Про себя",
];

export const SYMBOLIC_LIBRARY_TOPICS: readonly SymbolicLibraryTopic[] = [
  "Сны и символы",
  "Таро",
  "Матрица судьбы",
  "Натальная карта",
  "Совместимость",
  "Имя и фамилия",
];

export const LIBRARY_TOPICS: readonly LibraryTopic[] = [
  ...LIFE_LIBRARY_TOPICS,
  ...SYMBOLIC_LIBRARY_TOPICS,
];

export function isLibraryTopic(value: string): value is LibraryTopic {
  return (LIBRARY_TOPICS as readonly string[]).includes(value);
}

export type LibraryCtaProduct =
  | "Разбор переписки"
  | "Вместе"
  | "Переосмысление"
  | "Подробный разбор"
  | "Расклад Таро"
  | "Натальная карта"
  | "Матрица судьбы"
  | "Совместимость по звёздам"
  | "Арканы рождения"
  | "Кармический код фамилии";

const PRODUCT_SLUG: Record<LibraryCtaProduct, string> = {
  "Разбор переписки": "chat-analysis",
  "Вместе": "pair",
  "Переосмысление": "reframe",
  "Подробный разбор": "deep-report",
  "Расклад Таро": "tarot",
  "Натальная карта": "natal-chart",
  "Матрица судьбы": "numerology",
  "Совместимость по звёздам": "synastry",
  "Арканы рождения": "tarot-numerology",
  "Кармический код фамилии": "surname-story",
};

// Default service per theme (spec П.4 funnel). A card may override via `ctaProduct`
// for the "ИЛИ" cases (e.g. Отношения → Разбор переписки ИЛИ Вместе).
const TOPIC_DEFAULT_PRODUCT: Record<LibraryTopic, LibraryCtaProduct> = {
  "Отношения": "Разбор переписки",
  "Одиночество": "Вместе",
  "Повторяется одно и то же": "Переосмысление",
  "Про себя": "Переосмысление",
  "Тревога и состояние": "Переосмысление",
  "Работа и деньги": "Подробный разбор",
  "Выбор и решения": "Подробный разбор",
  "Сны и символы": "Подробный разбор",
  "Таро": "Расклад Таро",
  "Матрица судьбы": "Матрица судьбы",
  "Натальная карта": "Натальная карта",
  "Совместимость": "Совместимость по звёздам",
  "Имя и фамилия": "Кармический код фамилии",
};

export function topicDefaultProduct(topic: LibraryTopic): LibraryCtaProduct {
  return TOPIC_DEFAULT_PRODUCT[topic];
}

export type ResolvedLibraryCta = {
  product: LibraryCtaProduct;
  slug: string;
  productPath: string; // relative, e.g. "/products/perspectives"
  priceCredits: number;
  priceLabel: string; // "299 ₽"
  label: string; // button label
  teaserNote: string; // microcopy under the CTA
};

export function resolveLibraryCta(input: {
  topic: LibraryTopic;
  ctaProduct?: LibraryCtaProduct;
  fromSlug?: string;
}): ResolvedLibraryCta {
  const product = input.ctaProduct ?? topicDefaultProduct(input.topic);
  const slug = PRODUCT_SLUG[product];
  const credits = getProductCreditCost(slug) ?? 1;
  const priceLabel = getProductPriceLabel(slug) ?? "";
  // B454: services no longer ship a free fragment (the symbolic/joint paywall
  // rework, B450/B451) — so the microcopy states the honest price only, no
  // "первая часть бесплатно" promise that the product can't keep.
  const teaserNote = `разбор вашего вопроса — ${formatPoints(credits)}${
    priceLabel ? ` (${priceLabel})` : ""
  }`;
  const query = input.fromSlug
    ? `?from=library&slug=${encodeURIComponent(input.fromSlug)}`
    : "?from=library";
  return {
    product,
    slug,
    productPath: `/products/${slug}${query}`,
    priceCredits: credits,
    priceLabel,
    label: "Разобрать свой вопрос",
    teaserNote,
  };
}

/**
 * B596: тема «Хожу по кругу» переименована — доменный эксперт указал, что так
 * никто про себя не говорит и такого запроса не ищут. Старое значение осталось
 * в разосланных ссылках `/library?topic=…`, в закладках и во внешних
 * публикациях: без алиаса каждая из них открывала бы пустую библиотеку.
 */
const LEGACY_TOPIC_ALIASES: Readonly<Record<string, LibraryTopic>> = {
  "Хожу по кругу": "Повторяется одно и то же",
  "Паттерны": "Повторяется одно и то же",
};

export function resolveLibraryTopic(raw: string | undefined): LibraryTopic | undefined {
  if (!raw) return undefined;
  const aliased = LEGACY_TOPIC_ALIASES[raw] ?? raw;
  return (LIBRARY_TOPICS as readonly string[]).includes(aliased) ? (aliased as LibraryTopic) : undefined;
}
