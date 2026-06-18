/**
 * @jest-environment node
 */
import { AIProvider } from "@prisma/client";
import { AIProviderError } from "@/lib/ai-gateway/adapters";
import { createYandexAdapter } from "@/lib/ai-gateway/yandex-adapter";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("Yandex AI Studio adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends Foundation Models completion requests and normalizes usage", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      result: {
        alternatives: [
          {
            message: { role: "assistant", text: "Готово" },
            status: "ALTERNATIVE_STATUS_FINAL",
          },
        ],
        usage: {
          inputTextTokens: "12",
          completionTokens: "8",
          totalTokens: "20",
        },
        modelVersion: "25.03.2025",
      },
    }));
    const adapter = createYandexAdapter({
      apiKey: "yandex-test-key",
      folderId: "folder-123",
      fetchImpl,
    });

    const response = await adapter.complete({
      feature: "test.feature",
      messages: [
        { role: "system", content: "Отвечай кратко" },
        { role: "user", content: "Привет" },
      ],
      model: "yandexgpt-lite/latest",
      maxTokens: 100,
      temperature: 0.2,
      timeoutMs: 1234,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Api-Key yandex-test-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          modelUri: "gpt://folder-123/yandexgpt-lite/latest",
          completionOptions: {
            stream: false,
            temperature: 0.2,
            maxTokens: "100",
          },
          messages: [
            { role: "system", text: "Отвечай кратко" },
            { role: "user", text: "Привет" },
          ],
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(response).toEqual(expect.objectContaining({
      text: "Готово",
      provider: AIProvider.YANDEX,
      model: "yandexgpt-lite/latest",
      finishReason: "ALTERNATIVE_STATUS_FINAL",
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    }));
  });

  it("reports missing API key or folder id without making a network call", async () => {
    const fetchImpl = jest.fn();
    const adapter = createYandexAdapter({ apiKey: "", folderId: "", fetchImpl });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      name: "AIProviderError",
      provider: AIProvider.YANDEX,
      code: "MISSING_CONFIG",
      retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(adapter.healthcheck()).resolves.toEqual(expect.objectContaining({
      provider: AIProvider.YANDEX,
      status: "missing_config",
    }));
  });

  it("classifies provider HTTP failures without leaking secrets", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      error: { message: "invalid api key" },
    }, { ok: false, status: 401, statusText: "Unauthorized" }));
    const adapter = createYandexAdapter({
      apiKey: "super-secret-yandex-key",
      folderId: "folder-123",
      fetchImpl,
    });

    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toEqual(expect.objectContaining({
      provider: AIProvider.YANDEX,
      code: "HTTP_401",
      retryable: false,
    } satisfies Partial<AIProviderError>));
    await expect(adapter.complete({
      feature: "test.feature",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.not.toThrow("super-secret-yandex-key");
  });
});
