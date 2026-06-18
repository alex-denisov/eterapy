/**
 * @jest-environment node
 */
import { AIProvider } from "@prisma/client";
import {
  DEFAULT_PROVIDER_MODELS,
  DIRECT_PROVIDER_BASE_URLS,
  buildAdapterForCredential,
  providerLabel,
  resolvedProviderBaseUrl,
} from "@/lib/ai-gateway/provider-runtime";
import type { DecryptedAICredential } from "@/lib/ai-gateway/credentials";

const yandexCredential = (overrides: Partial<DecryptedAICredential> = {}): DecryptedAICredential => ({
  id: "cred_yandex",
  provider: AIProvider.YANDEX,
  label: "Yandex",
  apiKey: "yandex-test-key",
  baseUrlOverride: null,
  modelOverride: null,
  enabled: true,
  priority: 100,
  consecutiveFailures: 0,
  cooldownUntil: null,
  regionBlocked: false,
  ...overrides,
});

describe("Yandex provider runtime", () => {
  beforeEach(() => {
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses the direct Yandex endpoint and never builds a Cloudflare gateway URL", () => {
    const originalEnv = { ...process.env };
    process.env.CF_AI_GATEWAY_ACCOUNT_ID = "cf-account";
    process.env.CF_AI_GATEWAY_ID = "cf-gateway";

    try {
      expect(DIRECT_PROVIDER_BASE_URLS[AIProvider.YANDEX]).toBe("https://llm.api.cloud.yandex.net/foundationModels/v1");
      expect(DEFAULT_PROVIDER_MODELS[AIProvider.YANDEX]).toBe("yandexgpt/latest");
      expect(resolvedProviderBaseUrl({
        providerConfig: {
          provider: AIProvider.YANDEX,
          baseUrl: null,
          cloudflareGatewayEnabled: true,
        },
      })).toBe("https://llm.api.cloud.yandex.net/foundationModels/v1");
    } finally {
      process.env = originalEnv;
    }
  });

  it("builds a Yandex adapter from a decrypted credential", () => {
    const adapter = buildAdapterForCredential(yandexCredential());

    expect(adapter.provider).toBe(AIProvider.YANDEX);
    expect(providerLabel(AIProvider.YANDEX)).toBe("yandex");
  });

  it("ignores stale Cloudflare baseUrlOverride for Yandex credentials", async () => {
    const originalFetch = global.fetch;
    const originalFolderId = process.env.YANDEX_FOLDER_ID;
    process.env.YANDEX_FOLDER_ID = "folder-123";
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        alternatives: [{ message: { text: "OK" }, status: "ALTERNATIVE_STATUS_FINAL" }],
        usage: { inputTextTokens: "1", completionTokens: "1", totalTokens: "2" },
      }),
      text: async () => "{}",
    });
    global.fetch = fetchImpl as unknown as typeof fetch;

    try {
      const adapter = buildAdapterForCredential(yandexCredential({
        baseUrlOverride: "https://gateway.ai.cloudflare.com/v1/account/gateway/openai",
      }));

      await adapter.complete({
        feature: "test.feature",
        messages: [{ role: "user", content: "ping" }],
      });

      expect(fetchImpl).toHaveBeenCalledWith(
        "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
        expect.any(Object),
      );
    } finally {
      global.fetch = originalFetch;
      if (originalFolderId === undefined) delete process.env.YANDEX_FOLDER_ID;
      else process.env.YANDEX_FOLDER_ID = originalFolderId;
    }
  });
});
