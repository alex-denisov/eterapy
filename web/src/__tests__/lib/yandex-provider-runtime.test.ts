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
import { routingProofForProvider } from "@/lib/ai-gateway/routing-proof";

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

  it("forces every permitted foreign marketing request through Cloudflare AI Gateway", () => {
    const originalAccountId = process.env.CF_AI_GATEWAY_ACCOUNT_ID;
    const originalGatewayId = process.env.CF_AI_GATEWAY_ID;
    const originalRuGatewayFlag = process.env.CLOUDFLARE_AI_GATEWAY_ENABLED_FOR_RU;
    process.env.CF_AI_GATEWAY_ACCOUNT_ID = "cf-account";
    process.env.CF_AI_GATEWAY_ID = "eterapy";
    process.env.CLOUDFLARE_AI_GATEWAY_ENABLED_FOR_RU = "false";

    try {
      const providers = [
        AIProvider.OPENROUTER,
        AIProvider.GEMINI,
        AIProvider.GROQ,
        AIProvider.CEREBRAS,
      ];

      for (const provider of providers) {
        const url = resolvedProviderBaseUrl({
          credential: {
            provider,
            baseUrlOverride: DIRECT_PROVIDER_BASE_URLS[provider],
          },
          providerConfig: {
            provider,
            baseUrl: DIRECT_PROVIDER_BASE_URLS[provider],
            cloudflareGatewayEnabled: false,
          },
          requireCloudflareAIGateway: true,
        });
        expect(url).toMatch(/^https:\/\/gateway\.ai\.cloudflare\.com\//);
        expect(routingProofForProvider({
          provider,
          requireCloudflareAIGateway: true,
        })).toMatchObject({
          cloudflareAIGatewayUsed: true,
          foreignLLMUsed: true,
          crossBorderProcessing: true,
        });
      }
    } finally {
      if (originalAccountId === undefined) delete process.env.CF_AI_GATEWAY_ACCOUNT_ID;
      else process.env.CF_AI_GATEWAY_ACCOUNT_ID = originalAccountId;
      if (originalGatewayId === undefined) delete process.env.CF_AI_GATEWAY_ID;
      else process.env.CF_AI_GATEWAY_ID = originalGatewayId;
      if (originalRuGatewayFlag === undefined) delete process.env.CLOUDFLARE_AI_GATEWAY_ENABLED_FOR_RU;
      else process.env.CLOUDFLARE_AI_GATEWAY_ENABLED_FOR_RU = originalRuGatewayFlag;
    }
  });

  it("fails closed when the mandatory foreign Cloudflare route is not configured", () => {
    const originalAccountId = process.env.CF_AI_GATEWAY_ACCOUNT_ID;
    const originalGatewayId = process.env.CF_AI_GATEWAY_ID;
    delete process.env.CF_AI_GATEWAY_ACCOUNT_ID;
    delete process.env.CF_AI_GATEWAY_ID;

    try {
      expect(() => resolvedProviderBaseUrl({
        credential: {
          provider: AIProvider.OPENROUTER,
          baseUrlOverride: DIRECT_PROVIDER_BASE_URLS[AIProvider.OPENROUTER],
        },
        providerConfig: {
          provider: AIProvider.OPENROUTER,
          baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.OPENROUTER],
          cloudflareGatewayEnabled: false,
        },
        requireCloudflareAIGateway: true,
      // B634: требование расширено с «шлюз Cloudflare» до «контролируемый
      // шлюз» (наша зарубежная нода либо Cloudflare). Смысл fail-closed не
      // изменился: без единого шлюза запрос наружу не уходит вовсе.
      })).toThrow("No controlled AI gateway is configured");
    } finally {
      if (originalAccountId === undefined) delete process.env.CF_AI_GATEWAY_ACCOUNT_ID;
      else process.env.CF_AI_GATEWAY_ACCOUNT_ID = originalAccountId;
      if (originalGatewayId === undefined) delete process.env.CF_AI_GATEWAY_ID;
      else process.env.CF_AI_GATEWAY_ID = originalGatewayId;
    }
  });
});
