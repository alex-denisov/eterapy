import { AIProvider } from "@prisma/client";
import { AIProviderError } from "@/lib/ai-gateway/adapters";
import { createOpenAIAdapter } from "@/lib/ai-gateway/openai-adapter";

describe("OpenAI adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("normalizes chat completion responses", async () => {
    const create = jest.fn().mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "Готово" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const adapter = createOpenAIAdapter({
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
      model: "gpt-4o-mini",
      max_tokens: 100,
      temperature: 0.2,
    }), { timeout: 1234 });
    expect(response).toEqual(expect.objectContaining({
      text: "Готово",
      provider: AIProvider.OPENAI,
      model: "gpt-4o-mini",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    }));
  });

  it("reports missing config without making a network call", async () => {
    const adapter = createOpenAIAdapter({ apiKey: "" });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      name: "AIProviderError",
      code: "MISSING_CONFIG",
      retryable: false,
    });
    await expect(adapter.healthcheck()).resolves.toEqual(expect.objectContaining({
      provider: AIProvider.OPENAI,
      status: "missing_config",
    }));
  });

  it("classifies retryable provider failures", async () => {
    const create = jest.fn().mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    const adapter = createOpenAIAdapter({
      client: {
        chat: { completions: { create } },
      },
    });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toEqual(expect.objectContaining({
      provider: AIProvider.OPENAI,
      code: "HTTP_429",
      retryable: true,
    } satisfies Partial<AIProviderError>));
  });

  it("checks model health when configured", async () => {
    const retrieve = jest.fn().mockResolvedValue({ id: "gpt-4o-mini" });
    const adapter = createOpenAIAdapter({
      client: {
        chat: { completions: { create: jest.fn() } },
        models: { retrieve },
      },
    });

    await expect(adapter.healthcheck()).resolves.toEqual(expect.objectContaining({
      provider: AIProvider.OPENAI,
      status: "ok",
      model: "gpt-4o-mini",
      latencyMs: expect.any(Number),
    }));
    expect(retrieve).toHaveBeenCalledWith("gpt-4o-mini", { timeout: 30_000 });
  });
});
