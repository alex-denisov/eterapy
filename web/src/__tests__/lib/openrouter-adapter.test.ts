import { AIProvider } from "@prisma/client";
import { AIProviderError } from "@/lib/ai-gateway/adapters";
import { createOpenRouterAdapter } from "@/lib/ai-gateway/openrouter-adapter";

describe("OpenRouter adapter", () => {
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
      model: "meta-llama/llama-3.1-70b-instruct:free",
      choices: [{ message: { content: "Готово" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 14, completion_tokens: 9, total_tokens: 23 },
    });
    const adapter = createOpenRouterAdapter({
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
      model: "meta-llama/llama-3.1-70b-instruct:free",
      max_tokens: 100,
      temperature: 0.2,
    }), { timeout: 1234 });
    expect(response).toEqual(expect.objectContaining({
      text: "Готово",
      provider: AIProvider.OPENROUTER,
      model: "meta-llama/llama-3.1-70b-instruct:free",
      promptTokens: 14,
      completionTokens: 9,
      totalTokens: 23,
    }));
  });

  it("reports missing config without making a network call", async () => {
    const adapter = createOpenRouterAdapter({ apiKey: "" });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      name: "AIProviderError",
      code: "MISSING_CONFIG",
      retryable: false,
    });
    await expect(adapter.healthcheck()).resolves.toEqual(expect.objectContaining({
      provider: AIProvider.OPENROUTER,
      status: "missing_config",
    }));
  });

  it("classifies retryable provider failures", async () => {
    const create = jest.fn().mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    const adapter = createOpenRouterAdapter({
      client: {
        chat: { completions: { create } },
      },
    });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toEqual(expect.objectContaining({
      provider: AIProvider.OPENROUTER,
      code: "HTTP_429",
      retryable: true,
    } satisfies Partial<AIProviderError>));
  });

  it("normalizes numeric provider SDK codes to HTTP codes", async () => {
    const create = jest.fn().mockRejectedValue(Object.assign(new Error("insufficient credits"), { code: 402 }));
    const adapter = createOpenRouterAdapter({
      client: {
        chat: { completions: { create } },
      },
    });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toEqual(expect.objectContaining({
      provider: AIProvider.OPENROUTER,
      code: "HTTP_402",
      retryable: false,
    } satisfies Partial<AIProviderError>));
  });

  it("rejects non-free models without making a network call", async () => {
    const create = jest.fn();
    const adapter = createOpenRouterAdapter({
      apiKey: "test-key",
      client: { chat: { completions: { create } } },
    });

    await expect(adapter.complete({
      feature: "test.feature",
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      name: "AIProviderError",
      code: "MODEL_NOT_ALLOWED",
      retryable: false,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts :free models", async () => {
    const create = jest.fn().mockResolvedValue({
      model: "google/gemini-flash-1.5:free",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    const adapter = createOpenRouterAdapter({
      apiKey: "test-key",
      client: { chat: { completions: { create } } },
    });

    await expect(adapter.complete({
      feature: "test.feature",
      model: "google/gemini-flash-1.5:free",
      messages: [{ role: "user", content: "hello" }],
    })).resolves.toEqual(expect.objectContaining({
      provider: AIProvider.OPENROUTER,
      model: "google/gemini-flash-1.5:free",
    }));
  });

  it("checks model health when configured", async () => {
    const retrieve = jest.fn().mockResolvedValue({ id: "meta-llama/llama-3.1-70b-instruct:free" });
    const adapter = createOpenRouterAdapter({
      client: {
        chat: { completions: { create: jest.fn() } },
        models: { retrieve },
      },
    });

    await expect(adapter.healthcheck()).resolves.toEqual(expect.objectContaining({
      provider: AIProvider.OPENROUTER,
      status: "ok",
      model: "meta-llama/llama-3.1-70b-instruct:free",
      latencyMs: expect.any(Number),
    }));
    expect(retrieve).toHaveBeenCalledWith("meta-llama/llama-3.1-70b-instruct:free", { timeout: 30_000 });
  });
});
