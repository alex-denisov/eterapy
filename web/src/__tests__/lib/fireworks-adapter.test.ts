import { AIProvider } from "@prisma/client";
import { AIProviderError } from "@/lib/ai-gateway/adapters";
import { createFireworksAdapter } from "@/lib/ai-gateway/fireworks-adapter";

describe("Fireworks adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("normalizes OpenAI-compatible chat completion responses", async () => {
    const create = jest.fn().mockResolvedValue({
      model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
      choices: [{ message: { content: "Готово" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    });
    const adapter = createFireworksAdapter({
      client: {
        chat: { completions: { create } },
        models: { retrieve: jest.fn() },
      },
    });

    const response = await adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 100,
      temperature: 0.2,
      timeoutMs: 1234,
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
      max_tokens: 100,
      temperature: 0.2,
    }), { timeout: 1234 });
    expect(response).toEqual(expect.objectContaining({
      text: "Готово",
      provider: AIProvider.FIREWORKS,
      model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    }));
  });

  it("reports missing config without making a network call", async () => {
    const adapter = createFireworksAdapter({ apiKey: "" });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      name: "AIProviderError",
      code: "MISSING_CONFIG",
      retryable: false,
    });
    await expect(adapter.healthcheck()).resolves.toEqual(expect.objectContaining({
      provider: AIProvider.FIREWORKS,
      status: "missing_config",
    }));
  });

  it("classifies retryable provider failures", async () => {
    const create = jest.fn().mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    const adapter = createFireworksAdapter({
      client: {
        chat: { completions: { create } },
      },
    });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toEqual(expect.objectContaining({
      provider: AIProvider.FIREWORKS,
      code: "HTTP_429",
      retryable: true,
    } satisfies Partial<AIProviderError>));
  });

  it("checks model health when configured", async () => {
    const create = jest.fn().mockResolvedValue({
      model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
      choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    });
    const adapter = createFireworksAdapter({
      client: {
        chat: { completions: { create } },
      },
    });

    await expect(adapter.healthcheck()).resolves.toEqual(expect.objectContaining({
      provider: AIProvider.FIREWORKS,
      status: "ok",
      model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
      latencyMs: expect.any(Number),
    }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
      max_tokens: 128,
      temperature: 0,
    }), { timeout: 30_000 });
  });
});
