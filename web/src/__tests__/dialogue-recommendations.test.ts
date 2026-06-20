import {
  normalizeTopic,
  recommendPrimaryProduct,
  recommendSecondaryProducts,
  recommendSubscription,
  TOPIC_CATEGORIES,
  hashString,
} from "@/lib/dialogue-recommendations";

describe("W17 dialogue recommendation engine", () => {
  it("maps each topic to a distinct, catalog-backed primary product", () => {
    // «Совместимость» слита в «Вместе» (pair) → relationships рекомендует «Вместе».
    expect(recommendPrimaryProduct("relationships").slug).toBe("pair");
    expect(recommendPrimaryProduct("money").slug).toBe("deep-report");
    // B373 (M26): выпиленные услуги remapped на живые продукты.
    expect(recommendPrimaryProduct("anxiety").slug).toBe("deep-report");
    expect(recommendPrimaryProduct("self").slug).toBe("perspectives");
    // catalog metadata is attached (fixes the "card doesn't match" drift)
    const money = recommendPrimaryProduct("money");
    expect(money.name).toBe("Подробный разбор");
    expect(money.price).toMatch(/₽/);
  });

  it("falls back to perspectives for unknown/other topics", () => {
    expect(recommendPrimaryProduct(null).slug).toBe("perspectives");
    expect(recommendPrimaryProduct("nonsense").slug).toBe("perspectives");
    expect(normalizeTopic("nonsense")).toBe("other");
  });

  it("returns topic-adjacent secondary products excluding the primary", () => {
    const primary = recommendPrimaryProduct("relationships");
    const secondary = recommendSecondaryProducts("relationships", primary.slug);
    expect(secondary.length).toBeGreaterThan(0);
    expect(secondary.length).toBeLessThanOrEqual(3);
    expect(secondary.some((p) => p.slug === primary.slug)).toBe(false);
  });

  it("varies the secondary list by topic (not a single static list)", () => {
    const money = recommendSecondaryProducts("money", recommendPrimaryProduct("money").slug).map((p) => p.slug);
    const anxiety = recommendSecondaryProducts("anxiety", recommendPrimaryProduct("anxiety").slug).map((p) => p.slug);
    expect(money).not.toEqual(anxiety);
  });

  it("chooses the subscription tier by product fit, not always Plus", () => {
    // perspectives is in the Plus bundle
    expect(recommendSubscription("perspectives", false)?.tier).toBe("plus");
    // deep-report is Premium-only
    expect(recommendSubscription("deep-report", false)?.tier).toBe("premium");
    // X17: free/unmatched products surface Plus as the calm entry tier (the
    // nudge no longer disappears entirely), framed as «возвращаться».
    expect(recommendSubscription("unmatched-product", false)?.tier).toBe("plus");
    expect(recommendSubscription("tarot", false)?.tier).toBe("plus");
    // already-subscribed users are never nudged
    expect(recommendSubscription("deep-report", true)).toBeNull();
  });

  it("provides a topic→category map for practitioner matching", () => {
    expect(TOPIC_CATEGORIES.money).toContain("finance");
    expect(TOPIC_CATEGORIES.career).toContain("coaching");
    expect(TOPIC_CATEGORIES.anxiety).toContain("psychology");
  });

  it("hashes deterministically for stable per-dialogue rotation", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });
});
