import {
  dominantTopic,
  buildObservations,
  topObservation,
  tallyDiaryTopics,
  entriesWord,
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

// The topic→service recommendation cases moved to the B464 engine
// (lib/cabinet-recommendations.ts, b464-cabinet-recommendations.test.ts) —
// this file keeps the diary-side primitives.

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

  it("observation copy is a warm mirror with correct plurals (round-4 #12)", () => {
    const obs = topObservation({ relationships: 13 });
    expect(obs?.text).toContain("13 записей");
    expect(obs?.text).not.toContain("дневник открыл наблюдение");
    expect(entriesWord(13)).toBe("записей");
    expect(entriesWord(3)).toBe("записи");
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
