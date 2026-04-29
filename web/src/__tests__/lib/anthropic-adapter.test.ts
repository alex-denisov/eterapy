import { AIProvider } from "@prisma/client";
import { createAnthropicAdapter } from "@/lib/ai-gateway/anthropic-adapter";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Anthropic adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("normalizes Messages API responses", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      model: "claude-3-5-haiku-20241022",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Ответ" }],
      usage: { input_tokens: 11, output_tokens: 7 },
    }));
    const adapter = createAnthropicAdapter({ apiKey: "test-key", fetchImpl });

    const response = await adapter.complete({
      feature: "test.feature",
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "hello" },
      ],
      maxTokens: 200,
      temperature: 0.3,
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "x-api-key": "test-key",
        "anthropic-version": "2023-06-01",
      }),
      body: expect.stringContaining("\"system\":\"Be concise\""),
    }));
    expect(response).toEqual(expect.objectContaining({
      text: "Ответ",
      provider: AIProvider.ANTHROPIC,
      model: "claude-3-5-haiku-20241022",
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
    }));
  });

  it("reports missing config", async () => {
    const adapter = createAnthropicAdapter({ apiKey: "", fetchImpl: jest.fn() });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      code: "MISSING_CONFIG",
      retryable: false,
    });
    await expect(adapter.healthcheck()).resolves.toEqual(expect.objectContaining({
      status: "missing_config",
    }));
  });

  it("classifies retryable HTTP failures", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      error: { message: "rate limited" },
    }, { status: 429, statusText: "Too Many Requests" }));
    const adapter = createAnthropicAdapter({ apiKey: "test-key", fetchImpl });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      provider: AIProvider.ANTHROPIC,
      code: "HTTP_429",
      retryable: true,
    });
  });

  it("checks model health", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ id: "claude-3-5-haiku-20241022" }));
    const adapter = createAnthropicAdapter({ apiKey: "test-key", fetchImpl });

    await expect(adapter.healthcheck()).resolves.toEqual(expect.objectContaining({
      provider: AIProvider.ANTHROPIC,
      status: "ok",
      model: "claude-3-5-haiku-20241022",
      latencyMs: expect.any(Number),
    }));
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models/claude-3-5-haiku-20241022",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("adds Cloudflare AI Gateway auth header when base URL is a gateway", async () => {
    const originalToken = process.env.CF_AI_GATEWAY_TOKEN;
    process.env.CF_AI_GATEWAY_TOKEN = "cf-test-token";
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      model: "claude-3-5-haiku-20241022",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const adapter = createAnthropicAdapter({
      apiKey: "test-key",
      baseURL: "https://gateway.ai.cloudflare.com/v1/acc/gw/anthropic",
      fetchImpl,
    });

    await adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://gateway.ai.cloudflare.com/v1/acc/gw/anthropic/messages",
      expect.objectContaining({
        headers: expect.objectContaining({
          "cf-aig-authorization": "Bearer cf-test-token",
        }),
      }),
    );

    if (originalToken === undefined) delete process.env.CF_AI_GATEWAY_TOKEN;
    else process.env.CF_AI_GATEWAY_TOKEN = originalToken;
  });
});
