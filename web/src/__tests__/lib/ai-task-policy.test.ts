import { AIProvider } from "@prisma/client";
import {
  getDefaultAIRoutingPolicy,
  listDefaultAITaskPolicies,
  mergeAITaskPolicies,
} from "@/lib/ai-gateway/task-policy";

describe("AI task taxonomy and default routing policy", () => {
  it("maps v5 product tasks to free, premium, sensitive, vision, speech, and compliance tiers", () => {
    const policies = listDefaultAITaskPolicies();

    expect(policies.map((policy) => policy.feature)).toEqual(expect.arrayContaining([
      "dialogue-primary-answer",
      "dialogue-router",
      "safety-classification",
      "product-deep-report",
      "product-chat-analysis-ocr",
      "product-chat-analysis",
      "session-summary",
      "session-compliance",
    ]));
    const tiers = new Set(policies.map((policy) => policy.tier));
    expect(tiers.has("free")).toBe(true);
    expect(tiers.has("premium")).toBe(true);
    expect(tiers.has("sensitive")).toBe(true);
    expect(policies.some((policy) => policy.tier === "vision")).toBe(true);
    expect(policies.some((policy) => policy.tier === "speech")).toBe(true);
    expect(policies.some((policy) => policy.tier === "compliance")).toBe(true);
  });

  it("keeps sensitive and compliance defaults on direct providers", () => {
    const safety = getDefaultAIRoutingPolicy("safety_classification");
    const compliance = getDefaultAIRoutingPolicy("session-compliance");
    const chatOcr = getDefaultAIRoutingPolicy("product-chat-analysis-ocr");

    expect(safety?.providerOrder).toEqual([AIProvider.OPENAI, AIProvider.ANTHROPIC]);
    expect(compliance?.providerOrder).toEqual([AIProvider.OPENAI, AIProvider.ANTHROPIC]);
    expect(chatOcr?.providerOrder).toEqual([AIProvider.OPENAI, AIProvider.ANTHROPIC]);
    expect(safety?.fallbackNotes).toContain("No OpenRouter");
    expect(compliance?.fallbackNotes).toContain("human");
    expect(chatOcr?.fallbackNotes).toContain("screenshots stay on direct providers");
  });

  it("marks database policies while still showing default taxonomy metadata", () => {
    const merged = mergeAITaskPolicies([
      {
        id: "policy-1",
        feature: "dialogue-primary-answer",
        enabled: false,
        providerOrder: [AIProvider.OPENAI],
        modelPreferences: null,
        maxTokens: 321,
        temperature: 0,
        timeoutMs: 1234,
        dailyTokenBudget: null,
        perUserDailyTokenBudget: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const dialogue = merged.find((policy) => policy.feature === "dialogue-primary-answer");
    expect(dialogue).toEqual(expect.objectContaining({
      source: "database",
      title: "Free Диалог ясности",
      enabled: false,
      maxTokens: 321,
      providerOrder: [AIProvider.OPENAI],
    }));
  });
});
