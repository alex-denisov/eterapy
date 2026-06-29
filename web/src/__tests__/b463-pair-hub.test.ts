import {
  PAIR_HUB_SCENARIOS,
  PAIR_RELATIONSHIP_OPTIONS,
  PAIR_TENSION_PROMPT,
  resolvePairScenario,
  getPairRelationshipOption,
  composePairSelfView,
} from "@/lib/pair-hub";
import { TOGETHER_SCENARIOS } from "@/lib/together";

describe("B463 — pair hub data", () => {
  it("exposes exactly two hub scenarios (3rd «Совместимость» card folded away)", () => {
    expect(PAIR_HUB_SCENARIOS).toHaveLength(2);
    expect(PAIR_HUB_SCENARIOS.map((s) => s.key)).toEqual(["outside", "compare"]);
  });

  it("renames scenario 1 to «Свежий взгляд» and drops the old «Взгляд со стороны»", () => {
    const outside = PAIR_HUB_SCENARIOS.find((s) => s.key === "outside");
    expect(outside?.label).toBe("Свежий взгляд");
    const labels = PAIR_HUB_SCENARIOS.map((s) => s.label).join(" ");
    expect(labels).not.toContain("Взгляд со стороны");
  });

  it("never surfaces the colliding/jargon copy on hub scenarios", () => {
    const blob = JSON.stringify(PAIR_HUB_SCENARIOS);
    expect(blob).not.toContain("Совместимость");
    expect(blob).not.toContain("симметрич");
    expect(blob).not.toContain("движок");
  });

  it("gives each scenario a non-empty plain description", () => {
    for (const scenario of PAIR_HUB_SCENARIOS) {
      expect(scenario.description.trim().length).toBeGreaterThan(20);
    }
  });

  it("the compare scenario names «Ваша связь» as its relationship mode", () => {
    const compare = PAIR_HUB_SCENARIOS.find((s) => s.key === "compare");
    expect(compare?.description).toContain("Ваша связь");
  });

  it("TOGETHER_SCENARIOS no longer carries a standalone compatibility card", () => {
    expect(TOGETHER_SCENARIOS.some((s) => s.key === "compatibility")).toBe(false);
  });
});

describe("B463 — resolvePairScenario", () => {
  it("defaults to outside (lowest-friction)", () => {
    expect(resolvePairScenario(undefined)).toBe("outside");
    expect(resolvePairScenario(null)).toBe("outside");
    expect(resolvePairScenario("")).toBe("outside");
    expect(resolvePairScenario("nonsense")).toBe("outside");
  });

  it("honours an explicit compare deep-link", () => {
    expect(resolvePairScenario("compare")).toBe("compare");
  });

  it("treats the retired compatibility param as compare (folded mode)", () => {
    expect(resolvePairScenario("compatibility")).toBe("compare");
  });
});

describe("B463 — relationship mode («Ваша связь»)", () => {
  it("offers пара/друзья/семья/коллеги mapped to engine types", () => {
    expect(PAIR_RELATIONSHIP_OPTIONS.map((o) => o.label)).toEqual([
      "пара",
      "друзья",
      "семья",
      "коллеги",
    ]);
    expect(PAIR_RELATIONSHIP_OPTIONS.map((o) => o.key)).toEqual([
      "romantic",
      "friendship",
      "family",
      "business",
    ]);
  });

  it("defaults to a couple and re-skins the warmth prompt per type", () => {
    const romantic = getPairRelationshipOption("romantic");
    const business = getPairRelationshipOption("business");
    expect(romantic?.label).toBe("пара");
    expect(business?.label).toBe("коллеги");
    expect(romantic?.warmthPrompt).not.toEqual(business?.warmthPrompt);
    expect(getPairRelationshipOption("unknown")).toBeNull();
  });

  it("composes the guided answers into one calm free-text for the engine", () => {
    const text = composePairSelfView({
      type: "romantic",
      warmth: "Нам легко молчать вместе",
      tension: "Спорим из-за денег",
      question: "Стоит ли съезжаться?",
    });
    expect(text).toContain("Нам легко молчать вместе");
    expect(text).toContain("Спорим из-за денег");
    expect(text).toContain("Стоит ли съезжаться?");
    // tension is always represented even when warmth is short
    expect(text).toContain(PAIR_TENSION_PROMPT.replace(/\?$/, ""));
  });

  it("omits the optional question cleanly when blank", () => {
    const text = composePairSelfView({
      type: "friendship",
      warmth: "Мы давно дружим",
      tension: "Редко видимся",
    });
    expect(text).toContain("Мы давно дружим");
    expect(text).not.toContain("undefined");
    expect(text.trim().endsWith("undefined")).toBe(false);
  });
});
