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
  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.aIProviderConfig.findMany as jest.Mock).mockResolvedValue([
      {
        id: "provider-1",
        provider: AIProvider.OPENROUTER,
        displayName: "OpenRouter",
        enabled: true,
        priority: 10,
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
    (mockDb.$executeRaw as jest.Mock).mockResolvedValue(1);
    mockRunFallback.mockResolvedValue({
      response: {
        text: "Готово",
        provider: AIProvider.OPENROUTER,
        model: "openai/gpt-4o-mini",
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        latencyMs: 123,
      },
      attempts: [
        { provider: AIProvider.OPENROUTER, model: "openai/gpt-4o-mini", status: "succeeded" },
      ],
    });
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
        attempts: [
          expect.objectContaining({
            provider: AIProvider.OPENROUTER,
            maxTokens: 2000,
            temperature: 0.2,
          }),
        ],
      }),
    }));
    expect(result).toEqual({
      text: "Готово",
      model: "openai/gpt-4o-mini",
      provider: "openrouter",
      tokensIn: 1000,
      tokensOut: 500,
      latencyMs: 123,
    });
    expect(mockDb.aIRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ai-request-1" },
      data: expect.objectContaining({
        status: AIRequestStatus.SUCCEEDED,
        totalTokens: 1500,
        estimatedCostMicros: 250,
        metadata: expect.objectContaining({
          requestId: "req-1",
          responseText: "Готово",
          responseProvider: AIProvider.OPENROUTER,
          messages: expect.any(Array),
        }),
      }),
    }));
    expect(mockDb.aIAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        aiRequestId: "ai-request-1",
        provider: AIProvider.OPENROUTER,
        totalTokens: 1500,
        estimatedCostMicros: 250,
      }),
    }));
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(3);
  });
});
