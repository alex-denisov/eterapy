import { AIProvider, AIRequestStatus } from "@prisma/client";
import db from "@/lib/db";
import { listAIRoutingAuditLogs } from "@/lib/ai-gateway/routing-audit";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    aIRequest: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

describe("AI routing audit export", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.aIRequest.count as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    (mockDb.aIRequest.findMany as jest.Mock).mockResolvedValue([
      {
        id: "ai-request-1",
        feature: "modalities.tarot",
        userId: "user-1",
        status: AIRequestStatus.SUCCEEDED,
        providerGroup: "yandex",
        providerRegion: "ru",
        cloudflareAIGatewayUsed: false,
        foreignLLMUsed: false,
        crossBorderProcessing: false,
        fallbackUsed: false,
        fallbackReason: null,
        billingEventId: null,
        metadata: { requestId: "req-1" },
        createdAt: new Date("2026-06-18T01:00:00.000Z"),
        startedAt: new Date("2026-06-18T01:00:00.000Z"),
        finishedAt: new Date("2026-06-18T01:00:01.000Z"),
        attempts: [
          {
            provider: AIProvider.YANDEX,
            model: "yandexgpt-lite/latest",
            status: "SUCCEEDED",
            providerGroup: "yandex",
            providerRegion: "ru",
            cloudflareAIGatewayUsed: false,
            foreignLLMUsed: false,
            crossBorderProcessing: false,
            errorCode: null,
            startedAt: new Date("2026-06-18T01:00:00.000Z"),
            finishedAt: new Date("2026-06-18T01:00:01.000Z"),
          },
        ],
      },
    ]);
  });

  it("exports routing proof rows and applies cross-border filters", async () => {
    const result = await listAIRoutingAuditLogs({
      foreignLLMUsed: false,
      cloudflareAIGatewayUsed: false,
      crossBorderProcessing: false,
      provider: AIProvider.YANDEX,
      limit: 5000,
    });

    expect(mockDb.aIRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        foreignLLMUsed: false,
        cloudflareAIGatewayUsed: false,
        crossBorderProcessing: false,
        attempts: { some: { provider: AIProvider.YANDEX } },
      }),
      take: 1000,
    }));
    expect(result.summary).toEqual({
      total: 1,
      foreignLLMUsed: 0,
      cloudflareAIGatewayUsed: 0,
      crossBorderProcessing: 0,
      yandexOnlyShare: 1,
    });
    expect(result.rows[0]).toMatchObject({
      requestId: "req-1",
      providerGroup: "yandex",
      providerRegion: "ru",
      cloudflareAIGatewayUsed: false,
      foreignLLMUsed: false,
      crossBorderProcessing: false,
    });
  });
});
