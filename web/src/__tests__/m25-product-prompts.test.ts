import { readFileSync } from "fs";
import { join } from "path";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import { listDefaultAITaskPolicies } from "@/lib/ai-gateway/task-policy";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * B362 / Механика 7 — промты продуктов должны быть уникальны на продукт и
 * реально использоваться движком при оказании услуги.
 */
describe("B362 — per-product AI prompts", () => {
  it("each product has a distinct default prompt (not one shared text)", () => {
    const tarot = defaultPromptTextForFeature("product-tarot");
    const natal = defaultPromptTextForFeature("product-natal-chart");
    const numerology = defaultPromptTextForFeature("product-numerology");
    const reframe = defaultPromptTextForFeature("product-reframe");
    const unique = new Set([tarot, natal, numerology, reframe]);
    expect(unique.size).toBe(4);
    // The product-specific instruction is present (not just the shared guardrail).
    expect(tarot).toContain("Таро");
    expect(tarot).toContain("Прошлое / Настоящее / Будущее");
    // #7: отказывается от тем вне рефлексии (математика, программирование,
    // кулинария…), но РАБОТА/карьера остаётся в сфере, а тема — лишь мягкий
    // фокус, не повод для отказа.
    expect(tarot).toContain("математика");
    expect(tarot).toContain("программирование");
    expect(tarot).toContain("кулинария");
    expect(tarot).toContain("РАБОТА и карьера");
    expect(tarot).toContain("ограничение сферы вопроса");
    // Интерпретирует строго переданные карты, без подмены выпавших.
    expect(tarot).toContain("которые переданы в запросе");
    expect(natal).toContain("натальную карту");
    expect(numerology).toContain("числовой портрет");
  });

  it("symbolic products use the per-product prompt config, not one generic hardcode", () => {
    const lib = source("src/lib/symbolic-products.ts");
    expect(lib).toContain("defaultPromptTextForFeature(feature)");
    expect(lib).toContain("feature = `product-${input.productKey}`");
    // The old shared hardcoded system prompt is gone.
    expect(lib).not.toContain("Write a paid ETerapy symbolic product result in Russian.");
  });

  it("safety classification uses the hyphenated feature key so its prompt applies", () => {
    const safety = source("src/lib/dialogue-safety.ts");
    expect(safety).toContain('feature: "safety-classification"');
    expect(safety).not.toContain('feature: "safety_classification"');
  });

  it("every default AI task has a specific superadmin-visible system prompt", () => {
    const features = listDefaultAITaskPolicies().map((policy) => policy.feature);

    for (const feature of features) {
      const prompt = defaultPromptTextForFeature(feature);
      expect(prompt).not.toContain("Use the current ETerapy system prompt from code.");
      expect(prompt).not.toContain("{{defaultPrompt}}");
      expect(prompt.length).toBeGreaterThan(350);
    }

    expect(defaultPromptTextForFeature("product-outside-questions")).toContain("Взгляд со стороны");
    expect(defaultPromptTextForFeature("session-stt")).toContain("транскрип");
  });
});
