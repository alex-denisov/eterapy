// B366 (M26): single source of truth for product money — client-safe (no `db`,
// no server-only imports) so both client and server surfaces derive from it.
// `entitlements.ts` re-exports everything here for back-compat.
//
// The hidden ₽-value of 1 балл used to jump 124–299 ₽ between products; the ladder
// below holds it flat at ~272–299 ₽/балл (target band 250–300) so no product is a
// secret балл-bargain. Ladder: 1 балл = 299 ₽ · 2 = 590 ₽ · 3 = 890 ₽ · 4 = 1090 ₽
// (the 4-балл bundle is a ₽ discount vs the sum of its parts, so it dips to ~272).
// «Ежедневная практика»/«Маршрут 7 дней»/«Расширенная карта» retired in B373
// (practice is free, карта → Дневник) — fully removed from prices, billing and
// catalog. Pack/subscription acquisition pricing is a separate, intentional
// membership discount and is NOT governed by this per-product ladder.

export const V5_PRODUCT_PRICES_KOPECKS: Record<string, number> = {
  // B441 (M28): «perspectives» renamed → «reframe» (Переосмысление, CBT-рефрейминг).
  "reframe": 29900,
  "deep-report": 89000,
  // Z11/B366: packaging SKU = reframe + deep-report (1 + 3 = 4 балла). Priced
  // 1090 ₽ — a genuine discount vs buying separately (299 + 890 = 1189 ₽) so the
  // «выгоднее» badge is honest. Not a public product page. (272 ₽/балл, in band.)
  "full-question": 109000,
  "chat-analysis": 59000,
  "compatibility": 89000,
  "circle": 89000,
  "pair": 89000,
  "tarot": 59000,
  "natal-chart": 59000,
  "compatibility-by-date": 89000,
  "numerology": 89000,
  "horoscope": 59000,
  "arcana": 89000,
  // B389 (M26): genogram-разбор «Семейные вопросы», рекомендуется в Дневнике.
  // 4 балла = 1090 ₽ (272.5 ₽/балл, в полосе ладдера).
  "family-questions": 109000,
  // B387 (M26): «Дизайн человека» — тип/бодиграф бесплатно, платный глубокий разбор.
  // 2 балла = 590 ₽ (295 ₽/балл), тариф уровня натальной карты (личный «чертёж»).
  "human-design": 59000,
  // B391 (M26): «История фамилии» — короткая история фамилии бесплатно (магнит),
  // платный «родовой разбор». 2 балла = 590 ₽ (295 ₽/балл), уровень натальной карты.
  "surname-origin": 59000,
  // B386 (M26): платный чат-сеанс 45 мин. Цена утверждена владельцем: 790 ₽ / 4 балла
  // (197.5 ₽/балл — НАМЕРЕННО вне ладдера услуг: это «время в разговоре», другой
  // рычаг, не разовый разбор). НЕ в V5_LADDER_ACTIVE_PRODUCTS.
  "chat-session": 79000,
};

export const V5_PRODUCT_CREDIT_COSTS: Record<string, number> = {
  "reframe": 1,
  "deep-report": 3,
  "full-question": 4,
  "chat-analysis": 2,
  "compatibility": 3,
  "circle": 3,
  "pair": 3,
  "tarot": 2,
  "natal-chart": 2,
  "compatibility-by-date": 3,
  "numerology": 3,
  "horoscope": 2,
  "arcana": 3,
  "family-questions": 4,
  "human-design": 2,
  "surname-origin": 2,
  // B386 (M26): сеанс чата 45 мин = 4 балла; продление +30 мин = 2 балла.
  "chat-session": 4,
  "chat-extension": 2,
};

// Active (non-deprecated) priced products whose ₽/балл must stay in the 250–300
// band. (Retired services were fully removed in B373.)
export const V5_LADDER_ACTIVE_PRODUCTS = [
  "reframe", "deep-report", "full-question", "chat-analysis",
  "compatibility", "circle", "pair", "tarot", "natal-chart", "compatibility-by-date", "numerology", "horoscope", "arcana",
  "family-questions", "human-design", "surname-origin",
] as const;

export function getProductPriceKopecks(productKey: string): number | null {
  return V5_PRODUCT_PRICES_KOPECKS[productKey] ?? null;
}

export function getProductCreditCost(productKey: string): number | null {
  return V5_PRODUCT_CREDIT_COSTS[productKey] ?? null;
}

// Render kopecks as a ₽ label ("29900" → "299 ₽"). Single formatter so every
// surface shows the same number as V5_PRODUCT_PRICES_KOPECKS.
export function formatRubFromKopecks(kopecks: number): string {
  return `${Math.round(kopecks / 100).toLocaleString("ru-RU")} ₽`;
}

// "299 ₽" label for a product slug, derived from the single price source.
export function getProductPriceLabel(productKey: string): string | null {
  const kopecks = V5_PRODUCT_PRICES_KOPECKS[productKey];
  return kopecks == null ? null : formatRubFromKopecks(kopecks);
}
