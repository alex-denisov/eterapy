/** Одобренный ответ человеку не архивируется из-за гонки контейнера Threads (прод 2026-10-11). */

const publicationFindMany = jest.fn();
const publicationUpdate = jest.fn();
const publicationUpdateMany = jest.fn();
const publicationCreate = jest.fn();
const publicationGroupBy = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => publicationFindMany(...args),
      update: (...args: unknown[]) => publicationUpdate(...args),
      updateMany: (...args: unknown[]) => publicationUpdateMany(...args),
      create: (...args: unknown[]) => publicationCreate(...args),
      groupBy: (...args: unknown[]) => publicationGroupBy(...args),
    },
    marketingAutomationSignal: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn(),
    },
  },
}));

jest.mock("@/lib/marketing/agent", () => ({
  __esModule: true,
  resolveMarketingSignal: jest.fn().mockResolvedValue(undefined),
  upsertMarketingSignal: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: jest.fn().mockResolvedValue(false),
}));

import { recoverFailedPublications } from "@/lib/marketing/registry-recovery";

describe("threads reply race recovery", () => {
  beforeEach(() => {
    publicationFindMany.mockReset();
    publicationUpdate.mockReset().mockResolvedValue({});
    publicationUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    publicationGroupBy.mockReset().mockResolvedValue([]);
  });

  it("возвращает упавший одобренный ответ в очередь, а не в архив", async () => {
    publicationFindMany.mockResolvedValueOnce([{
      id: "r1", key: "k", platform: "threads", contentType: "INBOUND_REPLY",
      scheduledFor: new Date("2026-10-11T17:50:00Z"),
      lastError: "Threads reply publish failed: The requested resource does not exist",
      recoveryCount: 0, attemptCount: 2, planSlot: null, body: "Текст ответа",
      notes: null, agentReviewedAt: new Date(), deferralCount: 0,
    }]).mockResolvedValue([]);
    const result = await recoverFailedPublications({ now: new Date("2026-10-11T18:00:00Z") });
    expect(result.requeued).toBe(1);
    expect(result.archived).toBe(0);
    expect(publicationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "r1" },
      data: expect.objectContaining({ status: "SCHEDULED", attemptCount: 0 }),
    }));
  });
});
