import {
  getReferenceModelPricing,
  MODEL_PRICING_REFERENCE_USD_PER_MILLION,
  PROVIDER_FALLBACK_PRICING_USD_PER_MILLION,
} from "@/lib/ai-gateway/model-pricing-reference";

describe("T2 model pricing reference", () => {
  it("provides direct reference pricing for current flagship models", () => {
    expect(getReferenceModelPricing("OPENAI", "gpt-5")).toMatchObject({ input: 1.25, output: 10 });
    expect(getReferenceModelPricing("ANTHROPIC", "claude-haiku-4-5")).toMatchObject({ input: 1, output: 5 });
    expect(getReferenceModelPricing("GEMINI", "gemini-2.5-flash")).toMatchObject({ input: 0.3, output: 2.5 });
  });

  it("normalizes the models/ prefix for Gemini ids", () => {
    expect(getReferenceModelPricing("GEMINI", "models/gemini-2.5-pro")).toMatchObject({ input: 1.25, output: 10 });
  });

  it("falls back to a provider estimate so unknown models are never blank", () => {
    const pricing = getReferenceModelPricing("OPENAI", "some-future-unlisted-model");
    expect(pricing).not.toBeNull();
    expect(pricing).toMatchObject(PROVIDER_FALLBACK_PRICING_USD_PER_MILLION.OPENAI!);
  });

  it("keeps OpenRouter free models at zero cost", () => {
    expect(getReferenceModelPricing("OPENROUTER", "meta-llama/llama-3-8b:free")).toMatchObject({ input: 0, output: 0 });
  });

  it("covers every provider with at least one reference entry", () => {
    for (const provider of Object.keys(PROVIDER_FALLBACK_PRICING_USD_PER_MILLION)) {
      expect(MODEL_PRICING_REFERENCE_USD_PER_MILLION[provider as keyof typeof MODEL_PRICING_REFERENCE_USD_PER_MILLION]).toBeDefined();
    }
  });
});
