// B366 (M26): single source of truth for product money — client-safe (no `db`,
// no server-only imports) so both client and server surfaces derive from it.
// `entitlements.ts` re-exports everything here for back-compat.
//
// The hidden ₽-value of 1 балл used to jump 124–299 ₽ between products; the ladder
// below holds it flat at ~272–299 ₽/балл (target band 250–300) so no product is a
// secret балл-bargain. Ladder: 1 балл = 299 ₽ · 2 = 590 ₽ · 3 = 890 ₽ · 4 = 1090 ₽
// (the 4-балл bundle is a ₽ discount vs the sum of its parts, so it dips to ~272).
// seven-days/my-map are deprecated (practice is free, карта → Дневник) and removed
// from the catalog in B373 — their legacy values are excluded from the ₽/балл
// invariant. Pack/subscription acquisition pricing is a separate, intentional
// membership discount and is NOT governed by this per-product ladder.

export const V5_PRODUCT_PRICES_KOPECKS: Record<string, number> = {
  "perspectives": 29900,
  "deep-report": 89000,
  // Z11/B366: packaging SKU = perspectives + deep-report (1 + 3 = 4 балла). Priced
  // 1090 ₽ — a genuine discount vs buying separately (299 + 890 = 1189 ₽) so the
  // «выгоднее» badge is honest. Not a public product page. (272 ₽/балл, in band.)
  "full-question": 109000,
  "chat-analysis": 59000,
  "compatibility": 89000,
  "circle": 89000,
  "pair": 89000,
  "seven-days": 99000,
  "my-map": 99000,
  "tarot": 59000,
  "natal-chart": 59000,
  "synastry": 89000,
  "numerology": 59000,
};

export const V5_PRODUCT_CREDIT_COSTS: Record<string, number> = {
  "perspectives": 1,
  "deep-report": 3,
  "full-question": 4,
  "chat-analysis": 2,
  "compatibility": 3,
  "circle": 3,
  "pair": 3,
  "seven-days": 8,
  "my-map": 6,
  "tarot": 2,
  "natal-chart": 2,
  "synastry": 3,
  "numerology": 2,
};

// Active (non-deprecated) priced products whose ₽/балл must stay in the 250–300
// band. seven-days/my-map are intentionally excluded (deprecated, removed in B373).
export const V5_LADDER_ACTIVE_PRODUCTS = [
  "perspectives", "deep-report", "full-question", "chat-analysis",
  "compatibility", "circle", "pair", "tarot", "natal-chart", "synastry", "numerology",
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
