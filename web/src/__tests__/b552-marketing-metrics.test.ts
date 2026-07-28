import db from "@/lib/db";
import {
  collectDuePublicationMetrics,
  marketingMetricTestables,
} from "@/lib/marketing/metrics";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    externalPublicationMetric: { create: jest.fn() },
    channelAttribution: { count: jest.fn() },
    $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
  },
}));

jest.mock("@/lib/marketing/agent", () => ({
  upsertMarketingSignal: jest.fn(),
}));

const mockDb = db as unknown as {
  externalPublication: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
  };
  externalPublicationMetric: { create: jest.Mock };
  channelAttribution: { count: jest.Mock };
};

describe("B552 / B589 D+7 D+14 D+28 metric automation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.externalPublication.updateMany.mockResolvedValue({ count: 1 });
    mockDb.externalPublication.update.mockResolvedValue({});
    mockDb.externalPublicationMetric.create.mockResolvedValue({});
    mockDb.channelAttribution.count.mockResolvedValue(4);
  });

  it("records an idempotent D+7 platform snapshot and schedules D+14", async () => {
    const now = new Date("2026-08-10T09:00:00.000Z");
    mockDb.externalPublication.findMany.mockResolvedValue([{
      id: "publication-1",
      platform: "VK",
      contentType: "POST",
      publishedAt: new Date("2026-08-03T09:00:00.000Z"),
      nextReviewAt: now,
      externalPostId: "42",
      engagementTargetId: null,
      utmSource: "vk",
      utmCampaign: "campaign",
      metrics: [],
    }]);
    const adapter = jest.fn().mockResolvedValue({
      reach: 120,
      views: 100,
      reactions: 12,
      comments: 3,
      shares: 2,
    });

    await expect(collectDuePublicationMetrics({
      now,
      adapters: { vk: adapter },
    })).resolves.toEqual({ due: 1, recorded: 1, failed: 0 });

    expect(mockDb.externalPublicationMetric.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicationId: "publication-1",
        source: "API_VK_D7",
        views: 100,
        outboundClicks: 4,
        recordedAt: now,
      }),
    });
    expect(mockDb.externalPublication.update).toHaveBeenCalledWith({
      where: { id: "publication-1" },
      data: expect.objectContaining({
        nextReviewAt: new Date("2026-08-17T09:00:00.000Z"),
        lastError: null,
      }),
    });
  });

  it("selects the first missing due milestone without duplicating prior slices", () => {
    const publishedAt = new Date("2026-08-03T09:00:00.000Z");
    expect(marketingMetricTestables.firstDueMilestone(
      publishedAt,
      new Date("2026-08-20T09:00:00.000Z"),
      new Set(["API_VK_D7"]),
      "vk",
    )).toBe(14);
    expect(marketingMetricTestables.firstDueMilestone(
      publishedAt,
      new Date("2026-09-01T09:00:00.000Z"),
      new Set(["API_VK_D7", "API_VK_D14", "API_VK_D28"]),
      "vk",
    )).toBeNull();
  });
});
