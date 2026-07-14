import fs from "node:fs";
import path from "node:path";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import { analyzeSurname, computeSurnameCode, surnameFactsForAI } from "@/lib/surname-story";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B515 — Кармический код фамилии", () => {
  it("keeps every deterministic value visible and immutable for the LLM", () => {
    const story = analyzeSurname("Романова")!;
    const comparison = computeSurnameCode("Волкова")!;
    const facts = surnameFactsForAI(story, comparison, {
      mode: "change",
      name: "Анна",
      surname: "Романова",
      comparison: "Волкова",
      focus: "деньги",
      context: "Что усилится после смены фамилии?",
    });

    expect(facts).toContain("Р=9 + О=7 + М=5 + А=1 + Н=6 + О=7 + В=3 + А=1 = 39");
    expect(facts).toContain("Базовое число 1–9: 3");
    expect(facts).toContain("Арканический индекс 1–22: 17, XVII «Звезда»");
    expect(facts).toContain(`Формула второго варианта:`);
    expect(facts).toContain("не меняй числа, буквы и Арканы");
    expect(facts).toContain("символическая интерпретация");
  });

  it("audits the generation prompt for directness, structure and epistemic boundaries", () => {
    const prompt = defaultPromptTextForFeature("product-surname-story");
    for (const marker of [
      "## Прямой ответ",
      "## Формула фамилии",
      "## Главный ресурс рода",
      "## Родовая тень",
      "### В плюсе",
      "### В минусе",
      "### Как проверить у себя",
      "### Практики",
      "без автоматического утешения",
      "однако это не означает, что вы не сможете",
      "назови усиление, ослабление",
    ]) expect(prompt).toContain(marker);
    expect(prompt.toLocaleLowerCase("ru")).toContain("не выдумывай предков");
    expect(prompt.toLocaleLowerCase("ru")).toContain("не называй финансовый потолок фактом");
    expect(prompt).toContain("ответа `прислушайтесь к себе`");
  });

  it("ships adaptive scenarios, a live seal and an accessible interactive result", () => {
    const component = source("src/components/products/surname-story-actions.tsx");
    for (const marker of [
      "Моя фамилия",
      "Смена фамилии",
      "Имя + фамилия",
      "Псевдоним / бренд",
      "SurnameTeaser",
      "SealSvg",
      "LetterLedger",
      'role="tablist"',
      'role="tab"',
      'role="tabpanel"',
      "ArrowRight",
      "ArrowLeft",
      "toFixed(4)",
    ]) expect(component).toContain(marker);
    expect(component).not.toContain("Vera Forma");
  });

  it("keeps both desktop and mobile visuals on the light product theme", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain(".lineage-seal-comparison");
    expect(css).toContain(".lineage-seal-index");
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toContain("@media (max-width: 480px)");
    expect(css).toContain("var(--soft-paper-card)");
    expect(css).not.toMatch(/\.lineage-(?:seal|teaser)[\s\S]{0,180}background:\s*(?:#0|rgb\(0)/u);
  });

  it("routes a smoothing phrase back to the exact section repair", () => {
    const symbolic = source("src/lib/symbolic-products.ts");
    expect(symbolic).toContain("однако это не означает, что вы не сможете");
    expect(symbolic).toContain("const smoothingSection = parsedSections.find");
    expect(symbolic).toContain("в разделе ${smoothingSection.title}");
    expect(symbolic).toContain("headingsNamedInQualityIssue(issue, headings)");
  });
});
