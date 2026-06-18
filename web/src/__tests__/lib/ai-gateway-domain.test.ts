import { AIProvider } from "@prisma/client";
import {
  AI_GATEWAY_PROVIDERS,
  AI_PROVIDER_LABELS,
  aiBudgetPeriod,
  defaultProviderOrder,
  normalizeAIFeatureKey,
} from "@/lib/ai-gateway/domain";

describe("AI Gateway domain", () => {
  it("declares all v5 providers", () => {
    expect(AI_GATEWAY_PROVIDERS).toEqual([
      AIProvider.OPENAI,
      AIProvider.ANTHROPIC,
      AIProvider.FIREWORKS,
      AIProvider.OPENROUTER,
      AIProvider.GEMINI,
      AIProvider.GROQ,
      AIProvider.MISTRAL,
      AIProvider.CEREBRAS,
      AIProvider.COHERE,
      AIProvider.YANDEX,
    ]);
    expect(AI_PROVIDER_LABELS[AIProvider.GEMINI]).toBe("Google Gemini");
    expect(AI_PROVIDER_LABELS[AIProvider.FIREWORKS]).toBe("Fireworks AI");
    expect(AI_PROVIDER_LABELS[AIProvider.GROQ]).toBe("Groq");
    expect(AI_PROVIDER_LABELS[AIProvider.YANDEX]).toBe("Yandex AI Studio");
  });

  it("normalizes feature keys for policy lookup", () => {
    expect(normalizeAIFeatureKey(" Dialogue / Primary Answer ")).toBe("dialogue-primary-answer");
    expect(normalizeAIFeatureKey("modalities.tarot:v1")).toBe("modalities.tarot:v1");
  });

  it("uses daily budget periods", () => {
    expect(aiBudgetPeriod(new Date("2026-04-28T23:59:00.000Z"))).toBe("2026-04-28");
  });

  it("keeps OpenRouter first for current compatibility while allowing direct failovers", () => {
    expect(defaultProviderOrder()).toEqual([
      AIProvider.OPENROUTER,
      AIProvider.GEMINI,
      AIProvider.GROQ,
      AIProvider.MISTRAL,
      AIProvider.OPENAI,
      AIProvider.ANTHROPIC,
      AIProvider.COHERE,
      AIProvider.CEREBRAS,
      AIProvider.FIREWORKS,
      AIProvider.YANDEX,
    ]);
  });
});
