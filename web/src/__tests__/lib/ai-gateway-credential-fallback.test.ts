import { AIProvider } from "@prisma/client";
import {
  AIProviderError,
  type AIGatewayAdapter,
  type AIGatewayCompletionRequest,
  type AIGatewayCompletionResponse,
} from "@/lib/ai-gateway/adapters";
import {
  AIGatewayRoutingError,
  decideFailureFallback,
  runAIGatewayFallbackWithCredentials,
  type AICredentialAdapter,
  type AIRoutingPlan,
} from "@/lib/ai-gateway/routing";

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  serializeError: jest.fn((err) => ({ message: String(err) })),
}));

function makeAdapter(provider: AIProvider, behavior: (request: AIGatewayCompletionRequest) => Promise<AIGatewayCompletionResponse>): AIGatewayAdapter {
  return {
    provider,
    complete: behavior,
    healthcheck: async () => ({ provider, status: "ok" }),
  };
}

function ok(provider: AIProvider, model = "test"): AIGatewayCompletionResponse {
  return {
    text: "ok",
    provider,
    model,
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    latencyMs: 1,
  };
}

function adapter(credentialId: string, label: string, provider: AIProvider, behavior: (req: AIGatewayCompletionRequest) => Promise<AIGatewayCompletionResponse>): AICredentialAdapter {
  return { credentialId, credentialLabel: label, adapter: makeAdapter(provider, behavior) };
}

const PLAN: AIRoutingPlan = {
  feature: "test.feature",
  attempts: [
    { provider: AIProvider.ANTHROPIC, model: "claude", timeoutMs: 1000 },
    { provider: AIProvider.FIREWORKS, model: "llama", timeoutMs: 1000 },
  ],
};

describe("decideFailureFallback", () => {
  it("region/forbidden errors skip the entire provider", () => {
    expect(decideFailureFallback("HTTP_403")).toBe("skipProvider");
    expect(decideFailureFallback("MODEL_NOT_ALLOWED")).toBe("skipProvider");
    expect(decideFailureFallback("MISSING_CONFIG")).toBe("skipProvider");
    expect(decideFailureFallback("HTTP_400")).toBe("skipProvider");
    expect(decideFailureFallback("HTTP_404")).toBe("skipProvider");
  });

  it("auth/quota/rate-limit errors retry the next credential of the same provider", () => {
    expect(decideFailureFallback("HTTP_401")).toBe("retryNextCredential");
    expect(decideFailureFallback("HTTP_402")).toBe("retryNextCredential");
    expect(decideFailureFallback("HTTP_429")).toBe("retryNextCredential");
    expect(decideFailureFallback("HTTP_500")).toBe("retryNextCredential");
    expect(decideFailureFallback("TIMEOUT")).toBe("retryNextCredential");
    expect(decideFailureFallback(undefined)).toBe("retryNextCredential");
  });
});

describe("runAIGatewayFallbackWithCredentials", () => {
  it("rotates to the next key of the same provider on HTTP_401", async () => {
    const failingKey = jest.fn().mockRejectedValue(new AIProviderError("bad key", { provider: AIProvider.ANTHROPIC, code: "HTTP_401" }));
    const goodKey = jest.fn().mockResolvedValue(ok(AIProvider.ANTHROPIC, "claude"));

    const result = await runAIGatewayFallbackWithCredentials({
      plan: PLAN,
      request: { messages: [{ role: "user", content: "hi" }] },
      resolveAdapters: async (provider) => provider === AIProvider.ANTHROPIC
        ? [adapter("k1", "key1", provider, failingKey), adapter("k2", "key2", provider, goodKey)]
        : [],
    });

    expect(failingKey).toHaveBeenCalledTimes(1);
    expect(goodKey).toHaveBeenCalledTimes(1);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({ credentialId: "k1", status: "failed", code: "HTTP_401" });
    expect(result.attempts[1]).toMatchObject({ credentialId: "k2", status: "succeeded" });
    expect(result.response.provider).toBe(AIProvider.ANTHROPIC);
  });

  it("skips the entire provider on HTTP_403 and switches to next provider", async () => {
    const regionBlocked = jest.fn().mockRejectedValue(new AIProviderError("region", { provider: AIProvider.ANTHROPIC, code: "HTTP_403" }));
    const otherKeySameProvider = jest.fn().mockResolvedValue(ok(AIProvider.ANTHROPIC, "claude"));
    const fireworksOk = jest.fn().mockResolvedValue(ok(AIProvider.FIREWORKS, "llama"));

    const result = await runAIGatewayFallbackWithCredentials({
      plan: PLAN,
      request: { messages: [{ role: "user", content: "hi" }] },
      resolveAdapters: async (provider) => provider === AIProvider.ANTHROPIC
        ? [adapter("k1", "key1", provider, regionBlocked), adapter("k2", "key2", provider, otherKeySameProvider)]
        : [adapter("fw1", "fwkey", provider, fireworksOk)],
    });

    expect(regionBlocked).toHaveBeenCalledTimes(1);
    expect(otherKeySameProvider).not.toHaveBeenCalled(); // skipped because of HTTP_403
    expect(fireworksOk).toHaveBeenCalledTimes(1);
    expect(result.response.provider).toBe(AIProvider.FIREWORKS);
    expect(result.attempts.map((attempt) => attempt.credentialId)).toEqual(["k1", "fw1"]);
  });

  it("throws ALL_PROVIDERS_FAILED when every credential of every provider fails", async () => {
    const fail = (code: string) => jest.fn().mockRejectedValue(new AIProviderError("nope", { provider: AIProvider.ANTHROPIC, code }));

    await expect(runAIGatewayFallbackWithCredentials({
      plan: PLAN,
      request: { messages: [{ role: "user", content: "hi" }] },
      resolveAdapters: async (provider) => [
        adapter(`${provider}-1`, "k1", provider, fail("HTTP_429")),
        adapter(`${provider}-2`, "k2", provider, fail("HTTP_429")),
      ],
    })).rejects.toBeInstanceOf(AIGatewayRoutingError);
  });

  it("records MISSING_ADAPTER when a provider has no credentials", async () => {
    const fireworksOk = jest.fn().mockResolvedValue(ok(AIProvider.FIREWORKS, "llama"));

    const result = await runAIGatewayFallbackWithCredentials({
      plan: PLAN,
      request: { messages: [{ role: "user", content: "hi" }] },
      resolveAdapters: async (provider) => provider === AIProvider.FIREWORKS
        ? [adapter("fw1", "fwkey", provider, fireworksOk)]
        : [],
    });

    expect(result.attempts[0]).toMatchObject({ provider: AIProvider.ANTHROPIC, status: "skipped", code: "MISSING_ADAPTER" });
    expect(result.attempts[1]).toMatchObject({ provider: AIProvider.FIREWORKS, status: "succeeded" });
  });
});
