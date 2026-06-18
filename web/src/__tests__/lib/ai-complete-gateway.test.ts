import { AIProvider, AIRequestStatus } from "@prisma/client";
import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";
import { runAIGatewayFallbackWithCredentials } from "@/lib/ai-gateway/routing";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    aIProviderConfig: { findMany: jest.fn() },
    aIRoutingPolicy: { findUnique: jest.fn() },
    aIPromptConfig: { findUnique: jest.fn() },
    aIBudgetLedger: { findUnique: jest.fn() },
    aIRequest: { create: jest.fn(), update: jest.fn() },
    aIAttempt: { create: jest.fn() },
    aIProviderCredential: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    aIProviderModel: { findUnique: jest.fn() },
    foreignProviderRegistry: { findMany: jest.fn() },
    managementSpecialOrder: { findFirst: jest.fn() },
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/lib/ai-gateway/routing", () => {
  const actual = jest.requireActual("@/lib/ai-gateway/routing");
  return {
    __esModule: true,
    ...actual,
    runAIGatewayFallbackWithCredentials: jest.fn(),
  };
});

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  serializeError: jest.fn((err) => ({ message: err instanceof Error ? err.message : String(err) })),
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockRunFallback = runAIGatewayFallbackWithCredentials as jest.MockedFunction<typeof runAIGatewayFallbackWithCredentials>;

describe("aiComplete gateway migration", () => {
  const originalProviderMode = process.env.LLM_PROVIDER_MODE;
  const originalForeignLLMEnabled = process.env.FOREIGN_LLM_ENABLED;
  const originalCrossBorderProcessingEnabled = process.env.CROSS_BORDER_PROCESSING_ENABLED;
  const originalLegalCrossBorderReady = process.env.LEGAL_CROSS_BORDER_READY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LLM_PROVIDER_MODE = "YANDEX_ONLY";
    (mockDb.aIProviderConfig.findMany as jest.Mock).mockResolvedValue([
      {
        id: "provider-1",
        provider: AIProvider.YANDEX,
        displayName: "Yandex AI Studio",
        enabled: true,
        priority: 10,
        baseUrl: null,
        defaultModel: "yandexgpt-lite/latest",
        timeoutMs: 30000,
        rpmLimit: null,
        tpmLimit: null,
        inputTokenCostMicros: 100,
        outputTokenCostMicros: 300,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "provider-2",
        provider: AIProvider.OPENROUTER,
        displayName: "OpenRouter",
        enabled: false,
        priority: 50,
        baseUrl: null,
        defaultModel: "openai/gpt-4o-mini",
        timeoutMs: 30000,
        rpmLimit: null,
        tpmLimit: null,
        inputTokenCostMicros: 100,
        outputTokenCostMicros: 300,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    (mockDb.aIRoutingPolicy.findUnique as jest.Mock).mockResolvedValue(null);
    (mockDb.aIPromptConfig.findUnique as jest.Mock).mockResolvedValue(null);
    (mockDb.aIBudgetLedger.findUnique as jest.Mock).mockResolvedValue(null);
    (mockDb.aIRequest.create as jest.Mock).mockResolvedValue({
      id: "ai-request-1",
      feature: "modalities.tarot",
      userId: "user-1",
      status: AIRequestStatus.RUNNING,
      requestHash: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostMicros: 0,
      metadata: null,
      startedAt: new Date(),
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (mockDb.aIRequest.update as jest.Mock).mockResolvedValue({});
    (mockDb.aIAttempt.create as jest.Mock).mockResolvedValue({});
    (mockDb.aIProviderModel.findUnique as jest.Mock).mockResolvedValue(null);
    (mockDb.foreignProviderRegistry.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.managementSpecialOrder.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.$executeRaw as jest.Mock).mockResolvedValue(1);
    mockRunFallback.mockResolvedValue({
      response: {
        text: "Готово",
        provider: AIProvider.YANDEX,
        model: "yandexgpt-lite/latest",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        latencyMs: 123,
      },
      attempts: [
        { provider: AIProvider.YANDEX, model: "yandexgpt-lite/latest", status: "succeeded" },
      ],
    });
  });

  afterEach(() => {
    process.env.LLM_PROVIDER_MODE = originalProviderMode;
    process.env.FOREIGN_LLM_ENABLED = originalForeignLLMEnabled;
    process.env.CROSS_BORDER_PROCESSING_ENABLED = originalCrossBorderProcessingEnabled;
    process.env.LEGAL_CROSS_BORDER_READY = originalLegalCrossBorderReady;
  });

  it("keeps the legacy response contract while using gateway audit and usage ledger", async () => {
    const result = await aiComplete({
      feature: "modalities.tarot",
      userId: "user-1",
      requestId: "req-1",
      maxTokens: 2000,
      temperature: 0.2,
      messages: [{ role: "user", content: "hello" }],
    });

    expect(mockRunFallback).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({
        feature: "modalities.tarot",
        attempts: expect.arrayContaining([
          expect.objectContaining({
            provider: AIProvider.YANDEX,
            model: "yandexgpt-lite/latest",
            maxTokens: 2000,
            temperature: 0.2,
          }),
        ]),
      }),
    }));
    const runInput = mockRunFallback.mock.calls[0]?.[0];
    expect(runInput?.plan.attempts.map((attempt) => attempt.provider)).toEqual([
      AIProvider.YANDEX,
      AIProvider.YANDEX,
    ]);
    expect(result).toEqual({
      text: "Готово",
      model: "yandexgpt-lite/latest",
      provider: "yandex",
      tokensIn: 1000,
      tokensOut: 500,
      latencyMs: 123,
    });
    expect(mockDb.aIRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ai-request-1" },
        data: expect.objectContaining({
          status: AIRequestStatus.SUCCEEDED,
          providerGroup: "yandex",
          providerRegion: "ru",
          cloudflareAIGatewayUsed: false,
          foreignLLMUsed: false,
          crossBorderProcessing: false,
          fallbackUsed: false,
          totalTokens: 1500,
          estimatedCostMicros: 250,
          metadata: expect.objectContaining({
          requestId: "req-1",
          responseText: "Готово",
          responseProvider: AIProvider.YANDEX,
          messages: expect.any(Array),
        }),
      }),
    }));
    expect(mockDb.aIAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        aiRequestId: "ai-request-1",
        provider: AIProvider.YANDEX,
        providerGroup: "yandex",
        providerRegion: "ru",
        cloudflareAIGatewayUsed: false,
        foreignLLMUsed: false,
        crossBorderProcessing: false,
        totalTokens: 1500,
        estimatedCostMicros: 250,
      }),
    }));
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("blocks stale Cloudflare AI Gateway routing for Yandex-only RU calls before a provider request is sent", async () => {
    (mockDb.aIProviderConfig.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "provider-yandex-cf",
        provider: AIProvider.YANDEX,
        displayName: "Yandex AI Studio",
        enabled: true,
        priority: 10,
        baseUrl: "https://gateway.ai.cloudflare.com/v1/acc/gw/openai",
        defaultModel: "yandexgpt-lite/latest",
        timeoutMs: 30000,
        rpmLimit: null,
        tpmLimit: null,
        inputTokenCostMicros: 100,
        outputTokenCostMicros: 300,
        metadata: { cloudflareGatewayEnabled: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(aiComplete({
      feature: "modalities.tarot",
      userId: "user-1",
      requestId: "req-cf",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      code: "RU_CLOUDFLARE_GATEWAY_BLOCKED",
    });

    expect(mockRunFallback).not.toHaveBeenCalled();
    expect(mockDb.aIRequest.create).not.toHaveBeenCalled();
  });

  it("blocks legacy foreign-provider plans before request persistence without cross-border legal controls", async () => {
    process.env.LLM_PROVIDER_MODE = "LEGACY";
    process.env.FOREIGN_LLM_ENABLED = "true";
    process.env.CROSS_BORDER_PROCESSING_ENABLED = "false";
    process.env.LEGAL_CROSS_BORDER_READY = "false";
    (mockDb.aIProviderConfig.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "provider-openrouter",
        provider: AIProvider.OPENROUTER,
        displayName: "OpenRouter",
        enabled: true,
        priority: 10,
        baseUrl: "https://openrouter.ai/api/v1",
        defaultModel: "openai/gpt-4o-mini",
        timeoutMs: 30000,
        rpmLimit: null,
        tpmLimit: null,
        inputTokenCostMicros: 100,
        outputTokenCostMicros: 300,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    (mockDb.aIRoutingPolicy.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "policy-foreign",
      feature: "dialogue-clarifier",
      enabled: true,
      providerOrder: [AIProvider.OPENROUTER],
      modelPreferences: null,
      maxTokens: 1000,
      temperature: 0.4,
      timeoutMs: 30000,
      dailyTokenBudget: null,
      perUserDailyTokenBudget: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(aiComplete({
      feature: "dialogue-clarifier",
      userId: "user-1",
      requestId: "req-foreign",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      code: "CROSS_BORDER_FLAGS_DISABLED",
    });

    expect(mockRunFallback).not.toHaveBeenCalled();
    expect(mockDb.aIRequest.create).not.toHaveBeenCalled();
  });
});
