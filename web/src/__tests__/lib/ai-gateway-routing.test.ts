import { AIProvider } from "@prisma/client";
import { AIProviderError, type AIGatewayAdapter } from "@/lib/ai-gateway/adapters";
import {
  AIGatewayRoutingError,
  resolveAIRoutingPlan,
  runAIGatewayFallback,
  type AIRoutingProviderConfig,
} from "@/lib/ai-gateway/routing";

const providerConfigs: AIRoutingProviderConfig[] = [
  { provider: AIProvider.OPENROUTER, enabled: true, priority: 10, defaultModel: "openai/gpt-4o-mini", timeoutMs: 10_000 },
  { provider: AIProvider.OPENAI, enabled: true, priority: 20, defaultModel: "gpt-4o-mini", timeoutMs: 20_000 },
  { provider: AIProvider.ANTHROPIC, enabled: true, priority: 30, defaultModel: "claude-3-5-haiku-20241022", timeoutMs: 30_000 },
  { provider: AIProvider.FIREWORKS, enabled: false, priority: 40, defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct", timeoutMs: 40_000 },
];

function adapter(provider: AIProvider, complete: jest.Mock): AIGatewayAdapter {
  return {
    provider,
    complete,
    healthcheck: jest.fn(),
  };
}

describe("AI Gateway routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("resolves policy provider order, model preferences, and runtime parameters", () => {
    const plan = resolveAIRoutingPlan({
      feature: " Dialogue / Primary Answer ",
      providerConfigs,
      policy: {
        feature: "dialogue-primary-answer",
        enabled: true,
        providerOrder: [AIProvider.ANTHROPIC, AIProvider.OPENAI, AIProvider.ANTHROPIC, AIProvider.FIREWORKS],
        modelPreferences: {
          [AIProvider.ANTHROPIC]: "claude-3-5-sonnet-20241022",
        },
        maxTokens: 900,
        temperature: 0.4,
        timeoutMs: 12_345,
      },
    });

    expect(plan.feature).toBe("dialogue-primary-answer");
    expect(plan.attempts).toEqual([
      {
        provider: AIProvider.ANTHROPIC,
        model: "claude-3-5-sonnet-20241022",
        timeoutMs: 12_345,
        maxTokens: 900,
        temperature: 0.4,
      },
      {
        provider: AIProvider.OPENAI,
        model: "gpt-4o-mini",
        timeoutMs: 12_345,
        maxTokens: 900,
        temperature: 0.4,
      },
      {
        provider: AIProvider.OPENROUTER,
        model: "openai/gpt-4o-mini",
        timeoutMs: 12_345,
        maxTokens: 900,
        temperature: 0.4,
      },
    ]);
  });

  it("falls back to default provider order and enabled provider priority", () => {
    const plan = resolveAIRoutingPlan({
      feature: "test.feature",
      providerConfigs: [
        { provider: AIProvider.OPENAI, enabled: true, priority: 5, defaultModel: "gpt-4o-mini", timeoutMs: 1000 },
        { provider: AIProvider.FIREWORKS, enabled: true, priority: 1, defaultModel: "fw", timeoutMs: 2000 },
      ],
    });

    expect(plan.attempts.map((attempt) => attempt.provider)).toEqual([
      AIProvider.OPENAI,
      AIProvider.FIREWORKS,
    ]);
  });

  it("rejects disabled policies and missing enabled providers", () => {
    expect(() => resolveAIRoutingPlan({
      feature: "test.feature",
      providerConfigs,
      policy: { feature: "test.feature", enabled: false },
    })).toThrow(expect.objectContaining({
      code: "POLICY_DISABLED",
    } satisfies Partial<AIGatewayRoutingError>));

    expect(() => resolveAIRoutingPlan({
      feature: "test.feature",
      providerConfigs: providerConfigs.map((config) => ({ ...config, enabled: false })),
    })).toThrow(expect.objectContaining({
      code: "NO_ENABLED_PROVIDERS",
    } satisfies Partial<AIGatewayRoutingError>));
  });

  it("executes fallback attempts until a retryable failure succeeds on the next provider", async () => {
    const first = jest.fn().mockRejectedValue(new AIProviderError("rate limited", {
      provider: AIProvider.OPENROUTER,
      code: "HTTP_429",
      retryable: true,
    }));
    const second = jest.fn().mockResolvedValue({
      text: "ok",
      provider: AIProvider.OPENAI,
      model: "gpt-4o-mini",
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5,
      latencyMs: 100,
    });

    const result = await runAIGatewayFallback({
      plan: {
        feature: "test.feature",
        attempts: [
          { provider: AIProvider.OPENROUTER, model: "openai/gpt-4o-mini", timeoutMs: 1000 },
          { provider: AIProvider.OPENAI, model: "gpt-4o-mini", timeoutMs: 2000 },
        ],
      },
      adapters: new Map([
        [AIProvider.OPENROUTER, adapter(AIProvider.OPENROUTER, first)],
        [AIProvider.OPENAI, adapter(AIProvider.OPENAI, second)],
      ]),
      request: {
        messages: [{ role: "user", content: "hello" }],
      },
    });

    expect(first).toHaveBeenCalledWith(expect.objectContaining({
      feature: "test.feature",
      model: "openai/gpt-4o-mini",
      timeoutMs: 1000,
    }));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({
      feature: "test.feature",
      model: "gpt-4o-mini",
      timeoutMs: 2000,
    }));
    expect(result.response.provider).toBe(AIProvider.OPENAI);
    expect(result.attempts).toEqual([
      {
        provider: AIProvider.OPENROUTER,
        model: "openai/gpt-4o-mini",
        status: "failed",
        code: "HTTP_429",
        retryable: true,
      },
      {
        provider: AIProvider.OPENAI,
        model: "gpt-4o-mini",
        status: "succeeded",
      },
    ]);
  });

  it("stops fallback on non-retryable provider errors", async () => {
    const first = jest.fn().mockRejectedValue(new AIProviderError("bad request", {
      provider: AIProvider.OPENAI,
      code: "HTTP_400",
      retryable: false,
    }));
    const second = jest.fn();

    await expect(runAIGatewayFallback({
      plan: {
        feature: "test.feature",
        attempts: [
          { provider: AIProvider.OPENAI, model: "gpt-4o-mini", timeoutMs: 1000 },
          { provider: AIProvider.ANTHROPIC, model: "claude", timeoutMs: 2000 },
        ],
      },
      adapters: new Map([
        [AIProvider.OPENAI, adapter(AIProvider.OPENAI, first)],
        [AIProvider.ANTHROPIC, adapter(AIProvider.ANTHROPIC, second)],
      ]),
      request: {
        messages: [{ role: "user", content: "hello" }],
      },
    })).rejects.toMatchObject({
      code: "HTTP_400",
      retryable: false,
    });
    expect(second).not.toHaveBeenCalled();
  });
});
