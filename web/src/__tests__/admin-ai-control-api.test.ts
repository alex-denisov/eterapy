import { AIProvider } from "@prisma/client";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { GET, PATCH } from "@/app/api/admin/ai/control/route";
import { REQUEST_ID_HEADER } from "@/lib/request-context";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/moderator-permissions", () => ({
  __esModule: true,
  getUserPermissions: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    aIProviderConfig: { findMany: jest.fn(), upsert: jest.fn() },
    aIRoutingPolicy: { findMany: jest.fn(), upsert: jest.fn() },
    aIPromptConfig: { findMany: jest.fn(), upsert: jest.fn() },
    aIRequest: { findMany: jest.fn() },
    aIProviderCredential: { findMany: jest.fn() },
    aIProviderModel: { findMany: jest.fn() },
    foreignProviderRegistry: { findMany: jest.fn() },
    managementSpecialOrder: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockGetUserPermissions = getUserPermissions as jest.MockedFunction<typeof getUserPermissions>;
const mockDb = db as jest.Mocked<typeof db>;

function request(body?: unknown) {
  return new Request("https://admin.eterapy.com/api/admin/ai/control", {
    method: body ? "PATCH" : "GET",
    headers: {
      [REQUEST_ID_HEADER]: "admin-ai-control-123",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest;
}

describe("admin AI control API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", role: "SUPERADMIN" },
      expires: "2026-04-28T00:00:00.000Z",
    } as never);
    mockGetUserPermissions.mockResolvedValue(["ai.configure"]);
    (mockDb.aIProviderConfig.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.aIRoutingPolicy.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.aIPromptConfig.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.aIPromptConfig.upsert as jest.Mock).mockImplementation(async ({ create, update, where }) => ({
      id: `prompt-${where.feature}`,
      ...create,
      ...update,
      metadata: update?.metadata ?? create.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    (mockDb.aIRequest.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.aIProviderCredential.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.aIProviderModel.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.foreignProviderRegistry.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.managementSpecialOrder.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.user.findUnique as jest.Mock).mockResolvedValue({ id: "admin-1", role: "SUPERADMIN" });
    (mockDb.$queryRaw as jest.Mock).mockResolvedValue([]);
    (mockDb.aIProviderConfig.upsert as jest.Mock).mockResolvedValue({
      id: "provider-config-1",
      provider: AIProvider.YANDEX,
      displayName: "Yandex AI Studio",
      enabled: true,
      priority: 10,
      baseUrl: null,
      defaultModel: "yandexgpt-lite/latest",
      timeoutMs: 30000,
      rpmLimit: null,
      tpmLimit: null,
      inputTokenCostMicros: null,
      outputTokenCostMicros: null,
      metadata: { cloudflareGatewayEnabled: false },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (mockDb.aIRoutingPolicy.upsert as jest.Mock).mockResolvedValue({
      id: "policy-1",
      feature: "dialogue-primary-answer",
      enabled: true,
      providerOrder: [AIProvider.OPENROUTER, AIProvider.OPENAI],
      modelPreferences: null,
      maxTokens: 1000,
      temperature: 0.4,
      timeoutMs: 30000,
      dailyTokenBudget: 100000,
      perUserDailyTokenBudget: 5000,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("returns provider defaults and usage for ai.configure admins", async () => {
    const response = (await GET(request()))!;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe("admin-ai-control-123");
    expect(body.providers).toHaveLength(10);
    expect(body.providers[0]).toEqual(expect.objectContaining({
      provider: AIProvider.YANDEX,
      enabled: true,
    }));
    expect(body.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: AIProvider.GEMINI }),
      expect.objectContaining({ provider: AIProvider.GROQ, baseUrl: "https://api.groq.com/openai/v1" }),
      expect.objectContaining({ provider: AIProvider.MISTRAL }),
      expect.objectContaining({ provider: AIProvider.CEREBRAS }),
      expect.objectContaining({ provider: AIProvider.COHERE }),
    ]));
    expect(body.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ feature: "dialogue-primary-answer" }),
    ]));
    expect(body.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        feature: "dialogue-primary-answer",
        tier: "free",
        source: "default",
      }),
      expect.objectContaining({
        feature: "session-compliance",
        tier: "compliance",
      }),
    ]));
  });

  it("updates Yandex provider config and writes audit", async () => {
    const response = (await PATCH(request({
      type: "provider",
      provider: AIProvider.YANDEX,
      enabled: true,
      priority: 10,
      defaultModel: "yandexgpt-lite/latest",
      timeoutMs: 30000,
      cloudflareGatewayEnabled: true,
    })))!;

    expect(response.status).toBe(200);
    expect(mockDb.aIProviderConfig.upsert).toHaveBeenCalled();
    expect(mockDb.aIProviderConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        provider: AIProvider.YANDEX,
        metadata: { cloudflareGatewayEnabled: false },
        baseUrl: "https://llm.api.cloud.yandex.net/foundationModels/v1",
      }),
    }));
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "AI_PROVIDER_CONFIG_UPDATE",
        userId: "admin-1",
      }),
    }));
  });

  it("falls back to the direct base URL and clears CF metadata when gateway is not configured", async () => {
    // No CF env configured → enabling the toggle cannot apply CF, so the
    // provider must run on its standard direct URL and metadata must report
    // CF as NOT applied (prevents providers being stuck on a dead gateway).
    const prevAccount = process.env.CF_AI_GATEWAY_ACCOUNT_ID;
    const prevGateway = process.env.CF_AI_GATEWAY_ID;
    delete process.env.CF_AI_GATEWAY_ACCOUNT_ID;
    delete process.env.CF_AI_GATEWAY_ID;

    try {
      const response = (await PATCH(request({
        type: "provider",
        provider: AIProvider.GROQ,
        enabled: false,
        priority: 5,
        timeoutMs: 30000,
        cloudflareGatewayEnabled: true,
      })))!;

      expect(response.status).toBe(200);
      expect(mockDb.aIProviderConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({
          metadata: { cloudflareGatewayEnabled: false },
          baseUrl: "https://api.groq.com/openai/v1",
        }),
      }));
    } finally {
      process.env.CF_AI_GATEWAY_ACCOUNT_ID = prevAccount;
      process.env.CF_AI_GATEWAY_ID = prevGateway;
    }
  });

  it("rejects enabling foreign providers without legal cross-border approval", async () => {
    mockGetUserPermissions
      .mockResolvedValueOnce(["ai.configure"])
      .mockResolvedValueOnce(["ai.configure"] as never);

    const response = (await PATCH(request({
      type: "provider",
      provider: AIProvider.OPENROUTER,
      enabled: true,
      priority: 50,
      timeoutMs: 30000,
      cloudflareGatewayEnabled: false,
    })))!;
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("LEGAL_CROSS_BORDER_FORBIDDEN");
    expect(mockDb.aIProviderConfig.upsert).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "CROSS_BORDER_PROVIDER_ENABLE_DENIED",
        userId: "admin-1",
        targetId: AIProvider.OPENROUTER,
      }),
    }));
  });

  it("updates routing policy and normalizes feature key", async () => {
    const response = (await PATCH(request({
      type: "policy",
      feature: " Dialogue / Primary Answer ",
      enabled: true,
      providerOrder: [AIProvider.OPENROUTER, AIProvider.OPENAI],
      maxTokens: 1000,
      temperature: 0.4,
      timeoutMs: 30000,
      dailyTokenBudget: 100000,
      perUserDailyTokenBudget: 5000,
    })))!;

    expect(response.status).toBe(200);
    expect(mockDb.aIRoutingPolicy.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { feature: "dialogue-primary-answer" },
    }));
  });

  it("rejects admins without ai.configure", async () => {
    mockGetUserPermissions.mockResolvedValueOnce(["analytics.view"]);

    const response = (await GET(request()))!;
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
  });
});
