import {
  V5_PRODUCT_PRICES_KOPECKS,
  V5_PRODUCT_CREDIT_COSTS,
  V5_LADDER_ACTIVE_PRODUCTS,
  formatRubFromKopecks,
  getProductPriceLabel,
} from "@/lib/product-prices";
import { V5_BUNDLE_CONTENTS } from "@/lib/entitlements";
import { v5Products } from "@/lib/v5-products";
import { MIN_SESSION_PRICE_RUB, formatSessionFloor, SESSION_BASE_DURATION_MIN } from "@/lib/session-pricing";

// B366 (M26): the hidden ₽-value of 1 балл used to jump ~124–299 ₽ between
// products. These invariants pin it flat across the active catalog and make the
// public catalog provably consistent with the billing source of truth.
describe("B366 price ladder", () => {
  it("keeps the ₽-value of 1 балл inside the 250–300 ₽ band for every active product", () => {
    for (const slug of V5_LADDER_ACTIVE_PRODUCTS) {
      const kopecks = V5_PRODUCT_PRICES_KOPECKS[slug];
      const credits = V5_PRODUCT_CREDIT_COSTS[slug];
      expect(kopecks).toBeGreaterThan(0);
      expect(credits).toBeGreaterThan(0);
      const rubPerCredit = kopecks / 100 / credits;
      expect(rubPerCredit).toBeGreaterThanOrEqual(250);
      expect(rubPerCredit).toBeLessThanOrEqual(300);
    }
  });

  it("derives the public catalog price/баллы from the single billing source", () => {
    for (const product of v5Products) {
      const kopecks = V5_PRODUCT_PRICES_KOPECKS[product.slug];
      const credits = V5_PRODUCT_CREDIT_COSTS[product.slug];
      if (kopecks == null || credits == null) continue; // free / non-priced (e.g. practice)
      expect(product.price).toBe(formatRubFromKopecks(kopecks));
      expect(product.creditCost).toBe(credits);
    }
  });

  it("prices the full-question bundle as the sum of its parts in баллы, at a ₽ discount", () => {
    const parts = V5_BUNDLE_CONTENTS["full-question"];
    const partsCredits = parts.reduce((sum, slug) => sum + (V5_PRODUCT_CREDIT_COSTS[slug] ?? 0), 0);
    const partsKopecks = parts.reduce((sum, slug) => sum + (V5_PRODUCT_PRICES_KOPECKS[slug] ?? 0), 0);
    expect(V5_PRODUCT_CREDIT_COSTS["full-question"]).toBe(partsCredits);
    // Bundle ₽ is at most the sum of the parts (a genuine «выгоднее»).
    expect(V5_PRODUCT_PRICES_KOPECKS["full-question"]).toBeLessThanOrEqual(partsKopecks);
  });

  // toLocaleString("ru-RU") uses a non-breaking thousands separator — normalize
  // whitespace so 4-digit prices compare against plain-space literals.
  const norm = (s: string): string => s.replace(/\s+/g, " ");

  it("spot-checks the settled ladder numbers", () => {
    expect(getProductPriceLabel("reframe")).toBe("299 ₽");
    expect(getProductPriceLabel("chat-analysis")).toBe("590 ₽");
    expect(getProductPriceLabel("deep-report")).toBe("890 ₽");
    expect(getProductPriceLabel("compatibility-by-date")).toBe("890 ₽");
    expect(norm(getProductPriceLabel("full-question") ?? "")).toBe("1 090 ₽");
  });

  it("exposes a single 60-minute practitioner session floor", () => {
    expect(MIN_SESSION_PRICE_RUB).toBe(2000);
    expect(SESSION_BASE_DURATION_MIN).toBe(60);
    expect(norm(formatSessionFloor())).toBe("от 2 000 ₽");
  });
});
