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
    aIProviderCredential: { findMany: jest.fn() },
    aIProviderModel: { findMany: jest.fn() },
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
    });
    mockGetUserPermissions.mockResolvedValue(["ai.configure"]);
    mockDb.aIProviderConfig.findMany.mockResolvedValue([]);
    mockDb.aIRoutingPolicy.findMany.mockResolvedValue([]);
    mockDb.aIProviderCredential.findMany.mockResolvedValue([]);
    mockDb.aIProviderModel.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue([]);
    mockDb.aIProviderConfig.upsert.mockResolvedValue({
      id: "provider-config-1",
      provider: AIProvider.OPENROUTER,
      displayName: "OpenRouter",
      enabled: true,
      priority: 10,
      baseUrl: null,
      defaultModel: "openai/gpt-4o-mini",
      timeoutMs: 30000,
      rpmLimit: null,
      tpmLimit: null,
      inputTokenCostMicros: null,
      outputTokenCostMicros: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockDb.aIRoutingPolicy.upsert.mockResolvedValue({
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
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe("admin-ai-control-123");
    expect(body.providers).toHaveLength(4);
    expect(body.providers[0]).toEqual(expect.objectContaining({
      provider: AIProvider.OPENROUTER,
    }));
  });

  it("updates provider config and writes audit", async () => {
    const response = await PATCH(request({
      type: "provider",
      provider: AIProvider.OPENROUTER,
      enabled: true,
      priority: 10,
      defaultModel: "openai/gpt-4o-mini",
      timeoutMs: 30000,
    }));

    expect(response.status).toBe(200);
    expect(mockDb.aIProviderConfig.upsert).toHaveBeenCalled();
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "AI_PROVIDER_CONFIG_UPDATE",
        userId: "admin-1",
      }),
    }));
  });

  it("updates routing policy and normalizes feature key", async () => {
    const response = await PATCH(request({
      type: "policy",
      feature: " Dialogue / Primary Answer ",
      enabled: true,
      providerOrder: [AIProvider.OPENROUTER, AIProvider.OPENAI],
      maxTokens: 1000,
      temperature: 0.4,
      timeoutMs: 30000,
      dailyTokenBudget: 100000,
      perUserDailyTokenBudget: 5000,
    }));

    expect(response.status).toBe(200);
    expect(mockDb.aIRoutingPolicy.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { feature: "dialogue-primary-answer" },
    }));
  });

  it("rejects admins without ai.configure", async () => {
    mockGetUserPermissions.mockResolvedValueOnce(["analytics.view"]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
  });
});
