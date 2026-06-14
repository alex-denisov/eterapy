import { getNextStepRecommendation } from "@/lib/product-recommendations";
import { getV5Product } from "@/lib/v5-products";

describe("getNextStepRecommendation — chat-analysis resolver", () => {
  it("recommends «Вместе» when the other person is a partner", () => {
    const rec = getNextStepRecommendation("chat-analysis", { contact: "партнёр" });
    expect(rec?.slug).toBe("pair");
    expect(rec?.reason).toMatch(/вдвоём|Вместе/i);
  });

  it("recommends «Семейные сценарии» for a parent conversation", () => {
    const rec = getNextStepRecommendation("chat-analysis", { contact: "родитель" });
    expect(rec?.slug).toBe("family-scenarios");
  });

  it("recommends «Подробный разбор» for a workplace conversation", () => {
    expect(getNextStepRecommendation("chat-analysis", { contact: "коллега" })?.slug).toBe("deep-report");
    expect(getNextStepRecommendation("chat-analysis", { contact: "начальник" })?.slug).toBe("deep-report");
  });

  it("falls back to «Полная картина» for ex / friend / empty context", () => {
    expect(getNextStepRecommendation("chat-analysis", { contact: "бывший(ая)" })?.slug).toBe("perspectives");
    expect(getNextStepRecommendation("chat-analysis", { contact: "друг" })?.slug).toBe("perspectives");
    expect(getNextStepRecommendation("chat-analysis")?.slug).toBe("perspectives");
  });
});

describe("getNextStepRecommendation — catalog consistency", () => {
  it("pulls name / price / href from the v5 catalog (no drift)", () => {
    const rec = getNextStepRecommendation("chat-analysis", { contact: "партнёр" });
    const product = getV5Product("pair");
    expect(rec?.name).toBe(product?.name);
    expect(rec?.price).toBe(product?.price);
    expect(rec?.href).toBe(product?.route);
    expect(rec?.cta).toContain(product?.name ?? "");
  });

  it("never recommends the same service it was given", () => {
    // perspectives default → deep-report, but a self-loop must never surface.
    const all = ["chat-analysis", "perspectives", "deep-report", "pair", "tarot", "natal-chart", "human-design"];
    for (const key of all) {
      expect(getNextStepRecommendation(key)?.slug).not.toBe(key);
    }
  });
});

describe("getNextStepRecommendation — defaults & unknowns", () => {
  it("gives every catalogued product without a resolver a sensible default", () => {
    expect(getNextStepRecommendation("perspectives")?.slug).toBe("deep-report");
    expect(getNextStepRecommendation("surname-story")?.slug).toBe("family-scenarios");
    expect(getNextStepRecommendation("numerology")?.slug).toBe("natal-chart");
  });

  it("returns null for an unknown product key", () => {
    expect(getNextStepRecommendation("not-a-product")).toBeNull();
  });
});
