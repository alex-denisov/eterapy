/**
 * @jest-environment node
 */
import { AIProvider } from "@prisma/client";
import { fetchModelsFromProvider, getOpenRouterMetaModels } from "@/lib/ai-gateway/models";
import type { DecryptedAICredential } from "@/lib/ai-gateway/credentials";

const baseCred = (overrides: Partial<DecryptedAICredential> = {}): DecryptedAICredential => ({
  id: "cred_1",
  provider: AIProvider.OPENAI,
  label: "test",
  apiKey: "sk-test",
  baseUrlOverride: null,
  modelOverride: null,
  enabled: true,
  priority: 100,
  consecutiveFailures: 0,
  cooldownUntil: null,
  regionBlocked: false,
  ...overrides,
});

describe("ai-gateway/models", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(json: unknown, init: { ok?: boolean; status?: number } = {}) {
    const response = {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      statusText: init.status === 200 || init.status === undefined ? "OK" : "Error",
      json: async () => json,
      text: async () => JSON.stringify(json),
    };
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;
  }

  it("returns OpenAI model ids from /v1/models", async () => {
    mockFetch({ data: [{ id: "gpt-4o-mini", owned_by: "openai" }, { id: "gpt-4o" }] });
    const models = await fetchModelsFromProvider({
      provider: AIProvider.OPENAI,
      credential: baseCred({ provider: AIProvider.OPENAI }),
    });
    expect(models.map((m) => m.modelId)).toEqual(["gpt-4o-mini", "gpt-4o"]);
    expect(models.every((m) => m.isFree === false)).toBe(true);
  });

  it("returns Anthropic models with display name", async () => {
    mockFetch({ data: [{ id: "claude-3-5-haiku-20241022", display_name: "Claude 3.5 Haiku" }] });
    const models = await fetchModelsFromProvider({
      provider: AIProvider.ANTHROPIC,
      credential: baseCred({ provider: AIProvider.ANTHROPIC }),
    });
    expect(models[0]).toMatchObject({
      modelId: "claude-3-5-haiku-20241022",
      displayName: "Claude 3.5 Haiku",
      isFree: false,
    });
  });

  it("adds Cloudflare AI Gateway auth header when refreshing Anthropic models through gateway", async () => {
    const originalToken = process.env.CF_AI_GATEWAY_TOKEN;
    process.env.CF_AI_GATEWAY_TOKEN = "cf-test-token";
    mockFetch({ data: [{ id: "claude-3-5-haiku-20241022", display_name: "Claude 3.5 Haiku" }] });

    await fetchModelsFromProvider({
      provider: AIProvider.ANTHROPIC,
      credential: baseCred({
        provider: AIProvider.ANTHROPIC,
        baseUrlOverride: "https://gateway.ai.cloudflare.com/v1/acc/gw/anthropic",
      }),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://gateway.ai.cloudflare.com/v1/acc/gw/anthropic/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "cf-aig-authorization": "Bearer cf-test-token",
        }),
      }),
    );

    if (originalToken === undefined) delete process.env.CF_AI_GATEWAY_TOKEN;
    else process.env.CF_AI_GATEWAY_TOKEN = originalToken;
  });

  it("OpenRouter prepends openrouter/free + openrouter/auto meta-models and flags :free as free", async () => {
    mockFetch({
      data: [
        { id: "meta-llama/llama-3.1-70b-instruct:free", name: "Llama 3.1 70B Free", context_length: 8192, pricing: { prompt: "0", completion: "0" } },
        { id: "openai/gpt-4o-mini", name: "GPT-4o mini", context_length: 128000, pricing: { prompt: "0.00000015", completion: "0.0000006" } },
      ],
    });
    const models = await fetchModelsFromProvider({
      provider: AIProvider.OPENROUTER,
      credential: null,
    });
    expect(models[0].modelId).toBe("openrouter/free");
    expect(models[0].isFree).toBe(true);
    expect(models[1].modelId).toBe("openrouter/auto");
    expect(models[1].isFree).toBe(false);
    const free = models.find((m) => m.modelId === "meta-llama/llama-3.1-70b-instruct:free");
    expect(free?.isFree).toBe(true);
    const paid = models.find((m) => m.modelId === "openai/gpt-4o-mini");
    expect(paid?.isFree).toBe(false);
    expect(paid?.inputTokenCostMicros).toBe(150);
    expect(paid?.outputTokenCostMicros).toBe(600);
  });

  it("returns OpenAI-compatible Groq models with known model pricing", async () => {
    mockFetch({ data: [{ id: "llama-3.1-8b-instant", context_window: 131072 }] });
    const models = await fetchModelsFromProvider({
      provider: AIProvider.GROQ,
      credential: baseCred({ provider: AIProvider.GROQ }),
    });
    expect(models[0]).toMatchObject({
      modelId: "llama-3.1-8b-instant",
      contextWindow: 131072,
      inputTokenCostMicros: 50,
      outputTokenCostMicros: 80,
    });
  });

  it("OpenRouter does NOT require a credential (public catalogue)", async () => {
    mockFetch({ data: [] });
    await expect(
      fetchModelsFromProvider({ provider: AIProvider.OPENROUTER, credential: null }),
    ).resolves.toBeDefined();
  });

  it("adds Cloudflare AI Gateway auth header when refreshing OpenRouter models through gateway", async () => {
    const originalToken = process.env.CF_AI_GATEWAY_TOKEN;
    process.env.CF_AI_GATEWAY_TOKEN = "cf-test-token";
    mockFetch({ data: [] });

    await fetchModelsFromProvider({
      provider: AIProvider.OPENROUTER,
      credential: baseCred({
        provider: AIProvider.OPENROUTER,
        baseUrlOverride: "https://gateway.ai.cloudflare.com/v1/acc/gw/openrouter",
      }),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://gateway.ai.cloudflare.com/v1/acc/gw/openrouter/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "cf-aig-authorization": "Bearer cf-test-token",
        }),
      }),
    );

    if (originalToken === undefined) delete process.env.CF_AI_GATEWAY_TOKEN;
    else process.env.CF_AI_GATEWAY_TOKEN = originalToken;
  });

  it("getOpenRouterMetaModels exposes the meta entries", () => {
    const metas = getOpenRouterMetaModels();
    expect(metas.map((m) => m.modelId)).toEqual(["openrouter/free", "openrouter/auto"]);
  });
});
