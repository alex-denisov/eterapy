import { AIProvider, ForeignProviderRegistryStatus } from "@prisma/client";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import {
  assertCrossBorderProcessingAllowed,
  buildActiveSpecialOrderWhere,
  requireLegalCrossBorderManager,
} from "@/lib/ai-gateway/cross-border-gate";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    foreignProviderRegistry: { findMany: jest.fn() },
    managementSpecialOrder: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/moderator-permissions", () => ({
  __esModule: true,
  getUserPermissions: jest.fn(),
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockGetUserPermissions = getUserPermissions as jest.MockedFunction<typeof getUserPermissions>;

describe("cross-border AI legal gate", () => {
  const originalEnv = {
    LLM_PROVIDER_MODE: process.env.LLM_PROVIDER_MODE,
    FOREIGN_LLM_ENABLED: process.env.FOREIGN_LLM_ENABLED,
    CROSS_BORDER_PROCESSING_ENABLED: process.env.CROSS_BORDER_PROCESSING_ENABLED,
    LEGAL_CROSS_BORDER_READY: process.env.LEGAL_CROSS_BORDER_READY,
    MANAGEMENT_SPECIAL_ORDER_ID: process.env.MANAGEMENT_SPECIAL_ORDER_ID,
    MARKETING_FOREIGN_LLM_ENABLED: process.env.MARKETING_FOREIGN_LLM_ENABLED,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LLM_PROVIDER_MODE = "YANDEX_ONLY";
    process.env.FOREIGN_LLM_ENABLED = "false";
    process.env.CROSS_BORDER_PROCESSING_ENABLED = "false";
    process.env.LEGAL_CROSS_BORDER_READY = "false";
    delete process.env.MANAGEMENT_SPECIAL_ORDER_ID;
    delete process.env.MARKETING_FOREIGN_LLM_ENABLED;
    (mockDb.foreignProviderRegistry.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.managementSpecialOrder.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.user.findUnique as jest.Mock).mockResolvedValue({ id: "legal-1", role: "SUPERADMIN" });
    mockGetUserPermissions.mockResolvedValue(["legal.cross_border.manage"] as never);
  });

  afterEach(() => {
    process.env.LLM_PROVIDER_MODE = originalEnv.LLM_PROVIDER_MODE;
    process.env.FOREIGN_LLM_ENABLED = originalEnv.FOREIGN_LLM_ENABLED;
    process.env.CROSS_BORDER_PROCESSING_ENABLED = originalEnv.CROSS_BORDER_PROCESSING_ENABLED;
    process.env.LEGAL_CROSS_BORDER_READY = originalEnv.LEGAL_CROSS_BORDER_READY;
    process.env.MANAGEMENT_SPECIAL_ORDER_ID = originalEnv.MANAGEMENT_SPECIAL_ORDER_ID;
    process.env.MARKETING_FOREIGN_LLM_ENABLED = originalEnv.MARKETING_FOREIGN_LLM_ENABLED;
  });

  it("allows pure Yandex plans without legal checks", async () => {
    await expect(assertCrossBorderProcessingAllowed({
      providers: [AIProvider.YANDEX],
      scenario: "dialogue-clarifier",
    })).resolves.toBeUndefined();

    expect(mockDb.foreignProviderRegistry.findMany).not.toHaveBeenCalled();
    expect(mockDb.managementSpecialOrder.findFirst).not.toHaveBeenCalled();
  });

  it("blocks foreign providers when cross-border flags are disabled", async () => {
    await expect(assertCrossBorderProcessingAllowed({
      providers: [AIProvider.OPENROUTER],
      scenario: "dialogue-clarifier",
    })).rejects.toMatchObject({
      code: "CROSS_BORDER_FLAGS_DISABLED",
    });

    expect(mockDb.foreignProviderRegistry.findMany).not.toHaveBeenCalled();
    expect(mockDb.managementSpecialOrder.findFirst).not.toHaveBeenCalled();
  });

  it("allows only the free provider pool for public SMM content without platform user data", async () => {
    process.env.MARKETING_FOREIGN_LLM_ENABLED = "true";

    await expect(assertCrossBorderProcessingAllowed({
      providers: [AIProvider.OPENROUTER, AIProvider.GEMINI],
      scenario: "marketing-agent-writer",
      dataClass: "PUBLIC_MARKETING",
    })).resolves.toBeUndefined();

    await expect(assertCrossBorderProcessingAllowed({
      providers: [AIProvider.OPENAI],
      scenario: "marketing-agent-writer",
      dataClass: "PUBLIC_MARKETING",
    })).rejects.toMatchObject({ code: "CROSS_BORDER_FLAGS_DISABLED" });

    await expect(assertCrossBorderProcessingAllowed({
      providers: [AIProvider.OPENROUTER],
      scenario: "dialogue-clarifier",
      dataClass: "PUBLIC_MARKETING",
    })).rejects.toMatchObject({ code: "CROSS_BORDER_FLAGS_DISABLED" });
  });

  it("blocks foreign providers while their registry status is dormant for RU", async () => {
    process.env.LLM_PROVIDER_MODE = "LEGACY";
    process.env.FOREIGN_LLM_ENABLED = "true";
    process.env.CROSS_BORDER_PROCESSING_ENABLED = "true";
    process.env.LEGAL_CROSS_BORDER_READY = "true";
    (mockDb.foreignProviderRegistry.findMany as jest.Mock).mockResolvedValue([]);

    await expect(assertCrossBorderProcessingAllowed({
      providers: [AIProvider.OPENROUTER],
      scenario: "dialogue-clarifier",
    })).rejects.toMatchObject({
      code: "FOREIGN_PROVIDER_REGISTRY_INACTIVE",
    });

    expect(mockDb.managementSpecialOrder.findFirst).not.toHaveBeenCalled();
  });

  it("requires an active unexpired management special order for the scenario", async () => {
    process.env.LLM_PROVIDER_MODE = "LEGACY";
    process.env.FOREIGN_LLM_ENABLED = "true";
    process.env.CROSS_BORDER_PROCESSING_ENABLED = "true";
    process.env.LEGAL_CROSS_BORDER_READY = "true";
    process.env.MANAGEMENT_SPECIAL_ORDER_ID = "order-1";
    (mockDb.foreignProviderRegistry.findMany as jest.Mock).mockResolvedValue([
      { providerNameInternal: AIProvider.OPENROUTER, status: ForeignProviderRegistryStatus.ACTIVE },
    ]);

    await expect(assertCrossBorderProcessingAllowed({
      providers: [AIProvider.OPENROUTER],
      scenario: "admin-ai-provider-enable",
    })).rejects.toMatchObject({
      code: "NO_ACTIVE_SPECIAL_ORDER",
    });

    expect(mockDb.managementSpecialOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "order-1",
        status: "ACTIVE",
        allowedProviders: { hasEvery: [AIProvider.OPENROUTER] },
        validFrom: expect.objectContaining({ lte: expect.any(Date) }),
        validTo: expect.objectContaining({ gt: expect.any(Date) }),
        OR: [
          { allowedScenarios: { isEmpty: true } },
          { allowedScenarios: { has: "admin-ai-provider-enable" } },
        ],
      }),
      select: { id: true },
    }));
  });

  it("allows foreign providers only with flags, active registry row, and active order", async () => {
    process.env.LLM_PROVIDER_MODE = "LEGACY";
    process.env.FOREIGN_LLM_ENABLED = "true";
    process.env.CROSS_BORDER_PROCESSING_ENABLED = "true";
    process.env.LEGAL_CROSS_BORDER_READY = "true";
    (mockDb.foreignProviderRegistry.findMany as jest.Mock).mockResolvedValue([
      { providerNameInternal: AIProvider.OPENROUTER, status: ForeignProviderRegistryStatus.ACTIVE },
    ]);
    (mockDb.managementSpecialOrder.findFirst as jest.Mock).mockResolvedValue({ id: "order-1" });

    await expect(assertCrossBorderProcessingAllowed({
      providers: [AIProvider.OPENROUTER],
      scenario: "admin-ai-provider-enable",
    })).resolves.toBeUndefined();
  });

  it("rejects non-legal superadmin actors", async () => {
    (mockDb.user.findUnique as jest.Mock).mockResolvedValueOnce({ id: "admin-1", role: "ADMIN" });

    await expect(requireLegalCrossBorderManager("admin-1")).rejects.toMatchObject({
      code: "LEGAL_CROSS_BORDER_FORBIDDEN",
    });
  });

  it("builds an expiration-aware active order query", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const where = buildActiveSpecialOrderWhere({
      providers: [AIProvider.OPENROUTER, AIProvider.OPENAI],
      scenario: "dialogue-clarifier",
      now,
    });

    expect(where).toEqual(expect.objectContaining({
      status: "ACTIVE",
      validFrom: { lte: now },
      validTo: { gt: now },
      allowedProviders: { hasEvery: [AIProvider.OPENROUTER, AIProvider.OPENAI] },
    }));
  });
});
