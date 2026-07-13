import fs from "node:fs";
import path from "node:path";
import { calculateNatalAspectLines, calculateSynastryAspectLines, MAJOR_ASTROLOGY_ASPECTS } from "@/lib/astrology-aspects";
import { computeDestinyMatrix, parseStrictBirthDate } from "@/lib/destiny-matrix";
import { computeHumanDesign } from "@/lib/human-design";
import { computeTarotBirthCode } from "@/lib/tarot-birth-code";
import { buildNatalEphemerisWheel } from "@/lib/natal-ephemeris";
import { computeHoraryFacts } from "@/lib/horary";
import { defaultPromptTextForFeature, DIRECT_SYMBOLIC_ANSWER_CONTRACT } from "@/lib/ai-gateway/prompts";
import { v5Products } from "@/lib/v5-products";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B503–B511 — complete local esoteric suite", () => {
  it("draws every calculated major aspect with stable semantic colours", () => {
    const placements = [0, 60, 90, 120, 180].map((angle, index) => ({
      luminary: `p${index}`, glyph: "•", label: `P${index}`, signKey: "aries", signName: "Овен", signGlyph: "♈", angle, degreeInSign: angle % 30,
    }));
    expect(calculateNatalAspectLines(placements).length).toBeGreaterThan(5);
    expect(calculateSynastryAspectLines(placements, placements).length).toBeGreaterThan(placements.length);
    expect(new Set(MAJOR_ASTROLOGY_ASPECTS.map((aspect) => aspect.color)).size).toBe(5);
    expect(source("src/components/products/esoteric-chart-visuals.tsx")).not.toMatch(/calculate(?:Natal|Synastry)AspectLines\([^\n]+\)\.slice/);
  });

  it("matches the documented 01.01.2020 Destiny Matrix golden sample", () => {
    const matrix = computeDestinyMatrix(1, 1, 2020);
    expect([matrix.west.outer, matrix.north.outer, matrix.east.outer, matrix.south.outer, matrix.center]).toEqual([1, 1, 4, 6, 12]);
    expect(matrix.purposes).toMatchObject({ personal: 12, ancestral: 6, spiritual: 18, highest: 6 });
    expect(matrix.healthTotal).toEqual({ physical: 13, energy: 8, emotions: 12 });
    expect(matrix.love).toEqual({ entry: 18, core: 7, outcome: 7 });
    expect(matrix.money).toEqual({ entry: 16, core: 7, outcome: 5 });
    expect(matrix.perimeterCycle).toHaveLength(64);
    expect(matrix.health).toHaveLength(7);
    expect(parseStrictBirthDate("31.02.2020")).toBeNull();
  });

  it("matches all ten Lidrekon decoding positions for 01.01.2000", () => {
    const matrix = computeDestinyMatrix(1, 1, 2000);
    expect(matrix.zones.map(({ title, hint, value }) => [title, hint, value])).toEqual([
      ["Личность (день)", "Базовая энергия", 1],
      ["Талант (месяц)", "Небо и дар", 1],
      ["Социум (год)", "Как проявляетесь", 2],
      ["Задача", "Главный урок", 4],
      ["Центр", "Ядро личности", 8],
      ["Внутренний центр", "Личные ценности", 16],
      ["Деньги", "Финансовый канал", 10],
      ["Любовь", "Сердце и чувства", 7],
      ["Социальность", "Команда и люди", 5],
      ["Предназначение", "Общий вектор", 6],
    ]);
    expect([matrix.northwest.outer, matrix.northwest.middle, matrix.northwest.outerInner, matrix.northwest.inner]).toEqual([2, 18, 20, 16]);
  });

  it("keeps the 03.03.1988 prototype formulas aligned with the calculator", () => {
    const matrix = computeDestinyMatrix(3, 3, 1988);
    expect(matrix.purposes).toMatchObject({
      personalHeaven: 17,
      personalEarth: 11,
      personal: 10,
      paternal: 10,
      maternal: 10,
      ancestral: 20,
      spiritual: 3,
      highest: 5,
    });
    expect(matrix.love).toEqual({ entry: 6, core: 6, outcome: 12 });
    expect(matrix.money).toEqual({ entry: 18, core: 6, outcome: 6 });
  });

  it("computes the established two-card Tarot Birth Cards pair", () => {
    const first = computeTarotBirthCode(3, 3, 1988);
    const second = computeTarotBirthCode(3, 3, 1988);
    expect(first).toEqual(second);
    expect(first.positions).toHaveLength(2);
    expect(first.positions.map((position) => [position.key, position.energy])).toEqual([["birth-card", 14], ["soul-card", 5]]);
  });

  it("builds horary facts from the server-fixed UTC moment", () => {
    const input = "Вопрос: Состоится ли покупка квартиры?\nМесто: Москва\nКатегория: покупка\nМомент фиксации UTC: 2026-07-12T15:42:00.000Z";
    const future = input.replace("15:42:00.000Z", "15:52:00.000Z");
    const facts = computeHoraryFacts(buildNatalEphemerisWheel(input), input, buildNatalEphemerisWheel(future));
    expect(facts).toMatchObject({ method: "eterapy-horary-traditional-v1", subjectHouse: 4, category: "покупка" });
    expect(facts.querent.label).toBeTruthy();
    expect(facts.quesited.label).toBeTruthy();
  });

  it("adds Chiron and mean Lilith to both Human Design columns without making them structural", () => {
    const chart = computeHumanDesign(new Date("1988-03-03T18:00:00.000Z"));
    for (const column of [chart.personality, chart.design]) {
      expect(column.some((activation) => activation.body === "chiron")).toBe(true);
      expect(column.some((activation) => activation.body === "lilith")).toBe(true);
    }
    // NASA/JPL Horizons geocentric ecliptic longitude at this instant: 83.1253°.
    expect(chart.personality.find((activation) => activation.body === "chiron")?.longitude).toBeCloseTo(83.1253, 1);
    const structuralGates = new Set([...chart.personality, ...chart.design]
      .filter((activation) => activation.body !== "chiron" && activation.body !== "lilith")
      .map((activation) => activation.gate));
    expect(chart.activeGates.every((gate) => structuralGates.has(gate))).toBe(true);
  });

  it("applies the direct-answer contract to every new or reworked prompt", () => {
    expect(DIRECT_SYMBOLIC_ANSWER_CONTRACT).toMatch(/прямой ответ/i);
    for (const feature of ["product-natal-chart", "product-synastry", "product-numerology", "product-human-design", "product-surname-story", "product-horary", "product-tarot-numerology"]) {
      const prompt = defaultPromptTextForFeature(feature);
      expect(prompt).toContain("## Прямой ответ");
      expect(prompt).toMatch(/противореч/i);
    }
  });

  it("registers new products, prices, actions and editable AI features", () => {
    expect(v5Products.find((product) => product.slug === "horary")).toMatchObject({ price: "590 ₽", creditCost: 2 });
    expect(v5Products.find((product) => product.slug === "tarot-numerology")).toMatchObject({ price: "890 ₽", creditCost: 3 });
    const page = source("src/app/products/[slug]/page.tsx");
    expect(page).toContain("HoraryActions");
    expect(page).toContain("TarotNumerologyActions");
    const policy = source("src/lib/ai-gateway/task-policy.ts");
    expect(policy).toContain('feature: "product-horary"');
    expect(policy).toContain('feature: "product-tarot-numerology"');
    const createPayment = source("src/app/api/billing/create-payment/route.ts");
    const savedCard = source("src/app/api/billing/pay-with-saved-card/route.ts");
    expect(createPayment).toContain("resolveBillingPurchaseWithSettings");
    expect(savedCard).toContain("resolveBillingPurchaseWithSettings");
    const productPage = source("src/app/products/[slug]/page.tsx");
    expect(productPage).toContain("getSetting(`product.${baseProduct.slug}.price`)");
    expect(productPage).toContain("getSetting(`product.${baseProduct.slug}.credits`)");
    expect(source("src/app/api/billing/spend-credits/route.ts")).toContain("getConfiguredProductCreditCost");
  });

  it("keeps prototypes as review artifacts while production actions use direct input-to-result flows", () => {
    const dir = path.join(root, "../output/prototypes/esoteric-suite");
    for (const file of ["natal-chart.html", "synastry.html", "surname-name.html", "destiny-matrix.html", "horary.html", "tarot-numerology.html"]) {
      expect(fs.existsSync(path.join(dir, file))).toBe(true);
    }
    const actions = source("src/components/products/new-symbolic-product-actions.tsx");
    expect(actions).not.toContain('data-screen="build"');
    expect(actions).toContain("if (result?.resultText)");
  });
});
