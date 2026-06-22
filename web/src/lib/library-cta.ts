// B382 (M26): library taxonomy (7 life themes) + topic→service CTA funnel.
// Client-safe: derives credits/₽ from product-prices.ts (B366 single source of
// truth), so a card CTA can never drift from the product page price.

import { formatPoints } from "@/lib/points";
import { getProductCreditCost, getProductPriceLabel } from "@/lib/product-prices";

export type LibraryTopic =
  | "Отношения"
  | "Хожу по кругу"
  | "Тревога и состояние"
  | "Работа и деньги"
  | "Одиночество"
  | "Выбор и решения"
  | "Про себя";

// Catalog/filter order — life-stage flow, not alphabetical. The "Паттерны" label
// is intentionally gone (renamed «Хожу по кругу» per M26 spec table).
export const LIBRARY_TOPICS: readonly LibraryTopic[] = [
  "Отношения",
  "Хожу по кругу",
  "Тревога и состояние",
  "Работа и деньги",
  "Одиночество",
  "Выбор и решения",
  "Про себя",
];

export function isLibraryTopic(value: string): value is LibraryTopic {
  return (LIBRARY_TOPICS as readonly string[]).includes(value);
}

export type LibraryCtaProduct =
  | "Разбор переписки"
  | "Вместе"
  | "Переосмысление"
  | "Подробный разбор";

const PRODUCT_SLUG: Record<LibraryCtaProduct, string> = {
  "Разбор переписки": "chat-analysis",
  "Вместе": "pair",
  "Переосмысление": "reframe",
  "Подробный разбор": "deep-report",
};

// Default service per theme (spec П.4 funnel). A card may override via `ctaProduct`
// for the "ИЛИ" cases (e.g. Отношения → Разбор переписки ИЛИ Вместе).
const TOPIC_DEFAULT_PRODUCT: Record<LibraryTopic, LibraryCtaProduct> = {
  "Отношения": "Разбор переписки",
  "Одиночество": "Вместе",
  "Хожу по кругу": "Переосмысление",
  "Про себя": "Переосмысление",
  "Тревога и состояние": "Переосмысление",
  "Работа и деньги": "Подробный разбор",
  "Выбор и решения": "Подробный разбор",
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
  const teaserNote = `первая часть разбора бесплатно · полный — за ${formatPoints(credits)}${
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
