import {
  dialogueTopicFromChip,
  normalizeTopic,
  recommendPrimaryProduct,
  recommendPrimaryProductExcluding,
  recommendSecondaryProducts,
} from "@/lib/product-format-recommendations";

// B443: общие рекомендации форматов («что вам подойдет») для самодостаточных услуг
// (reframe, deep-report). Тема собирается RU-чипом → DialogueTopic; primary никогда
// не совпадает с услугой, которую человек только что прошёл.
describe("dialogueTopicFromChip — RU service chips → DialogueTopic", () => {
  it("maps the reframe/deep-report chips to canonical topics", () => {
    expect(dialogueTopicFromChip("работа")).toBe("career");
    expect(dialogueTopicFromChip("отношения")).toBe("relationships");
    expect(dialogueTopicFromChip("семья")).toBe("family");
    expect(dialogueTopicFromChip("сам(а) с собой")).toBe("self");
    expect(dialogueTopicFromChip("здоровье")).toBe("anxiety");
    expect(dialogueTopicFromChip("деньги")).toBe("money");
    expect(dialogueTopicFromChip("другое")).toBe("other");
  });

  it("falls back to «other» for empty / unknown chips, and passes canonical keys through", () => {
    expect(dialogueTopicFromChip(null)).toBe("other");
    expect(dialogueTopicFromChip(undefined)).toBe("other");
    expect(dialogueTopicFromChip("не существует")).toBe("other");
    // already-canonical keys still normalize cleanly
    expect(dialogueTopicFromChip("career")).toBe(normalizeTopic("career"));
  });
});

describe("recommendPrimaryProductExcluding — never recommend the current service", () => {
  it("returns the topic's primary product when it differs from the current service", () => {
    // relationships → pair (not reframe), so reframe screen keeps the real rec
    const rec = recommendPrimaryProductExcluding("relationships", "reframe");
    expect(rec.slug).toBe("pair");
  });

  it("falls back to an adjacent format when the topic's primary IS the current service", () => {
    // career → reframe; on the reframe screen that would be a self-recommendation
    const reframeScreen = recommendPrimaryProductExcluding("career", "reframe");
    expect(reframeScreen.slug).not.toBe("reframe");

    // anxiety → deep-report; on the deep-report screen, fall back to an adjacent
    const deepScreen = recommendPrimaryProductExcluding("anxiety", "deep-report");
    expect(deepScreen.slug).not.toBe("deep-report");
  });

  it("agrees with recommendPrimaryProduct when there is no collision", () => {
    expect(recommendPrimaryProductExcluding("money", "reframe").slug).toBe(
      recommendPrimaryProduct("money").slug,
    );
  });
});

describe("recommendSecondaryProducts — adjacent formats", () => {
  it("excludes the primary slug and respects the limit", () => {
    const secondary = recommendSecondaryProducts("relationships", "pair", 3);
    expect(secondary.length).toBeLessThanOrEqual(3);
    expect(secondary.every((p) => p.slug !== "pair")).toBe(true);
  });
});
