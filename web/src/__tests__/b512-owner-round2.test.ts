import fs from "node:fs";
import path from "node:path";
import { parseMarkdownBlocks } from "@/lib/markdown";
import { defaultPromptTextForFeature, mergeAIPromptOverride } from "@/lib/ai-gateway/prompts";
import { canResolveAstrologicalLocation } from "@/lib/natal-ephemeris";
import { surnameValueFromStructuredInput } from "@/lib/surname-story";
import { presentSymbolicSectionTitle } from "@/components/products/symbolic-result-scaffold";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B512 owner acceptance round 2", () => {
  it("renders every common ordered and unordered list marker without a bare model marker", () => {
    const blocks = parseMarkdownBlocks([
      "- первый",
      "- второй",
      "",
      "• третий",
      "• четвёртый",
      "",
      "1) пятый",
      "2) шестой",
      "",
      "1.",
    ].join("\n"));
    const lists = blocks.filter((block) => block.type === "list");
    expect(lists).toHaveLength(3);
    expect(lists.map((list) => list.type === "list" ? list.items.length : 0)).toEqual([2, 2, 2]);
    expect(JSON.stringify(blocks)).not.toContain('"text":"1."');
  });

  it("presents a product-specific title while retaining the internal direct-answer contract", () => {
    expect(presentSymbolicSectionTitle("tarot", "Прямой ответ")).toBe("Вердикт расклада");
    expect(presentSymbolicSectionTitle("natal-chart", "Прямой ответ")).toBe("Главный вывод карты");
    expect(presentSymbolicSectionTitle("synastry", "Прямой ответ")).toBe("Главный вывод о вашей связи");
    expect(presentSymbolicSectionTitle("numerology", "Прямой ответ")).toBe("Главный вывод матрицы");
    expect(presentSymbolicSectionTitle("human-design", "Прямой ответ")).toBe("Главный ключ вашего дизайна");
    expect(presentSymbolicSectionTitle("surname-story", "Прямой ответ")).toBe("Прямой итог родового аудита");
  });

  it("keeps current expert structure and runtime facts when a legacy admin prompt has no placeholder", () => {
    const feature = "product-natal-chart";
    const codeDefault = defaultPromptTextForFeature(feature);
    const runtime = `${codeDefault}\n\nТОЧНО ПОСЧИТАНО: Солнце — Луна, тригон.`;
    const merged = mergeAIPromptOverride(feature, runtime, "Старый бережный админ-промт");
    expect(merged).toContain("Старый бережный админ-промт");
    expect(merged).toContain("## Аспекты: главные ресурсы");
    expect(merged).toContain("ТОЧНО ПОСЧИТАНО: Солнце — Луна, тригон.");
  });

  it("extracts the explicit surname instead of mistaking a given name ending in -ин", () => {
    expect(surnameValueFromStructuredInput("Имя: Константин\nФамилия: Смирнов\nВопрос: откуда фамилия?")).toBe("Смирнов");
  });

  it("resolves every advertised horary location and explicit coordinates", () => {
    expect(canResolveAstrologicalLocation("Место: Москва")).toBe(true);
    expect(canResolveAstrologicalLocation("Место: Санкт-Петербург")).toBe(true);
    expect(canResolveAstrologicalLocation("Место: Казань")).toBe(true);
    expect(canResolveAstrologicalLocation("Место: 55.7558, 37.6173")).toBe(true);
    expect(canResolveAstrologicalLocation("Место: неизвестный хутор")).toBe(false);
  });

  it("ships rotating contextual placeholders on all requested intake surfaces", () => {
    for (const file of [
      "natal-chart-actions.tsx",
      "synastry-actions.tsx",
      "numerology-actions.tsx",
      "human-design-actions.tsx",
      "surname-story-actions.tsx",
      "new-symbolic-product-actions.tsx",
    ]) {
      expect(source(`src/components/products/${file}`)).toContain("useRotatingPlaceholder");
    }
    const birthArcana = source("src/components/products/new-symbolic-product-actions.tsx");
    expect(birthArcana).not.toContain('useState<string | null>("личность")');
    expect(birthArcana).not.toContain('placeholder="Алексей"');
    expect(birthArcana).not.toContain("Карта рождения и карта души рассчитываются");
    expect(birthArcana).not.toContain("Вопрос сформулирован именно так");
    expect(birthArcana).toContain("Точное время вопроса будет использовано автоматически");
  });

  it("moves Tarot prose into accordions and leaves exactly the page-level standard disclaimer", () => {
    const actions = source("src/components/products/symbolic-product-actions.tsx");
    const page = source("src/app/products/[slug]/page.tsx");
    expect(actions).toContain('testId="tarot-accordion"');
    expect(actions).not.toContain("AutosavedNote");
    expect(actions).not.toContain("ProductDisclaimer");
    expect(page).toContain("<ProductDisclaimer />");
  });

  it("restores only the matching owned product and surfaces missing-reading errors", () => {
    const hook = source("src/components/products/use-symbolic-service.ts");
    const tarot = source("src/components/products/symbolic-product-actions.tsx");
    const synastry = source("src/components/products/synastry-actions.tsx");
    const route = source("src/app/api/products/symbolic/[id]/route.ts");
    expect(hook).toContain("?productKey=${encodeURIComponent(productKey)}");
    expect(tarot).toContain("?productKey=tarot");
    expect(route).toContain("expectedProductKey");
    expect(route).toContain("!SYMBOLIC_PRODUCT_KEYS.includes");
    for (const value of [hook, tarot, synastry]) expect(value).toMatch(/не найден или недоступен/u);
  });

  it("uses an auditable lineage seal without SVG text truncation or generic fact/version/mirror cards", () => {
    const surname = source("src/components/products/surname-story-actions.tsx");
    expect(surname).toContain("Родовая печать");
    expect(surname).toContain("lineage-seal-arcana-tick");
    expect(surname).toContain("LetterLedger");
    expect(surname).toContain("Сумма");
    expect(surname).not.toContain("slice(0, 20)");
    expect(surname).not.toContain(">факт<");
    expect(surname).not.toContain(">версия<");
    expect(surname).not.toContain(">зеркало<");
  });

  it("requires plus, minus and practices only in every one of the ten Matrix positions", () => {
    const lib = source("src/lib/symbolic-products.ts");
    expect(lib).toContain("for (const zone of input.numerology.matrix.zones)");
    expect(lib).toMatch(/!\/В плюсе\/[\s\S]{0,120}!\/В минусе\/[\s\S]{0,120}!\/Практик\//u);
    expect(lib).toContain("matrixZoneHeadings.includes(heading)");
  });

  it("rejects empty or token-only required chapters before a paid result is saved", () => {
    const symbolic = source("src/lib/symbolic-products.ts");
    const synastry = source("src/lib/synastry.ts");
    expect(symbolic).toContain("const sectionMinimum = input.productKey === \"surname-story\" ? 220 : 160");
    expect(symbolic).toContain("`неполный раздел ${weakSection.title}`");
    expect(synastry).toContain("Math.ceil(SYNASTRY_HEADINGS.length / 3)");
    expect(synastry).toContain("`неполный раздел ${weakSection.title}`");
  });
});
