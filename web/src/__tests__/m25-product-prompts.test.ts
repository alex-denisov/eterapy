import { readFileSync } from "fs";
import { join } from "path";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";

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
    const perspectives = defaultPromptTextForFeature("product-perspectives");
    const unique = new Set([tarot, natal, numerology, perspectives]);
    expect(unique.size).toBe(4);
    // The product-specific instruction is present (not just the shared guardrail).
    expect(tarot).toContain("Таро");
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
});
