import {
  recommendForDiary,
  dominantTopic,
  buildObservations,
  topObservation,
  tallyDiaryTopics,
  FAMILY_SCENARIOS_MIN,
  OBSERVATION_MIN,
} from "@/lib/diary-recommendation";
import {
  V5_PRODUCT_PRICES_KOPECKS,
  V5_PRODUCT_CREDIT_COSTS,
  getProductPriceLabel,
} from "@/lib/product-prices";
import { isSymbolicProductKey, getSymbolicProductDefinition } from "@/lib/symbolic-products";
import { getV5Product } from "@/lib/v5-products";
import { isKnownPaidProduct } from "@/lib/entitlements";

describe("B389 diary recommendation engine — 4 canonical cases", () => {
  it("family ≥3 → «Семейные сценарии» (paid)", () => {
    const rec = recommendForDiary({ family: 3, relationships: 2, anxiety: 1 });
    expect(rec.key).toBe("family-scenarios");
    expect(rec.paid).toBe(true);
    expect(rec.route).toBe("/products/family-scenarios");
  });

  it("dominant relationships → «Вместе»", () => {
    const rec = recommendForDiary({ relationships: 4, anxiety: 1, family: 1 });
    expect(rec.key).toBe("together");
    expect(rec.route).toBe("/products/pair");
  });

  it("dominant anxiety → «Подробный разбор»", () => {
    const rec = recommendForDiary({ anxiety: 3, self: 1 });
    expect(rec.key).toBe("deep-report");
    expect(rec.route).toBe("/products/deep-report");
  });

  it("few/no themes → «Ежедневный вопрос» (free)", () => {
    expect(recommendForDiary({}).key).toBe("daily-question");
    expect(recommendForDiary({ self: 1 }).key).toBe("daily-question");
    expect(recommendForDiary({ relationships: 1 }).paid).toBe(false);
  });

  it("family threshold is exclusive below 3", () => {
    const rec = recommendForDiary({ family: 2 });
    expect(rec.key).not.toBe("family-scenarios");
  });

  it("a dominant non-special topic still earns a разбор", () => {
    expect(recommendForDiary({ career: 4 }).key).toBe("deep-report");
    expect(recommendForDiary({ money: 3 }).key).toBe("deep-report");
  });
});

describe("B389 dominant topic + observations", () => {
  it("picks the highest-count topic, tie-broken by priority", () => {
    expect(dominantTopic({ career: 2, relationships: 2 })?.topic).toBe("relationships");
    expect(dominantTopic({})).toBeNull();
  });

  it("opens an observation only at ≥3 entries on a topic", () => {
    expect(buildObservations({ career: 2 })).toHaveLength(0);
    const obs = buildObservations({ career: 3, relationships: 4 });
    expect(obs).toHaveLength(2);
    expect(obs[0].topic).toBe("relationships"); // higher count first
    expect(topObservation({ career: 3 })?.topicLabel).toBe("Карьера");
    expect(OBSERVATION_MIN).toBe(3);
  });

  it("tallies topics from diary items (dialogues carry topic, products do not)", () => {
    const counts = tallyDiaryTopics([
      { topic: "family" },
      { topic: "family" },
      { topic: "relationships" },
      { topic: null },
      {},
    ]);
    expect(counts).toEqual({ family: 2, relationships: 1 });
  });

  it("exposes the family threshold constant", () => {
    expect(FAMILY_SCENARIOS_MIN).toBe(3);
  });
});

describe("B389 «Семейные сценарии» product is sellable and renders", () => {
  it("is a known paid product priced at 4 балла / 1090 ₽", () => {
    expect(isKnownPaidProduct("family-scenarios")).toBe(true);
    expect(V5_PRODUCT_CREDIT_COSTS["family-scenarios"]).toBe(4);
    expect(V5_PRODUCT_PRICES_KOPECKS["family-scenarios"]).toBe(109000);
    expect(getProductPriceLabel("family-scenarios")?.replace(/\s+/g, " ")).toBe("1 090 ₽");
  });

  it("is wired into the symbolic product pipeline and catalog", () => {
    expect(isSymbolicProductKey("family-scenarios")).toBe(true);
    expect(getSymbolicProductDefinition("family-scenarios")?.title).toBe("Семейные сценарии");
    expect(getV5Product("family-scenarios")?.productKey).toBe("family-scenarios");
    expect(getV5Product("family-scenarios")?.route).toBe("/products/family-scenarios");
  });
});
