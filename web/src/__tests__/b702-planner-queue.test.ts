/**
 * B702 фаза 4 — планировщик интегрирован в генератор черновиков.
 *
 * Интеграция проверяется на включённом планировщике: планировщик решает тему
 * слота, генератор пишет её в реестр, а notes получают источник темы
 * (origin/rationale) для сводки конвейера. Гейт включается env-флагом — в
 * остальных тестах он выключен, и поведение конвейера прежнее.
 */

const publicationFindMany = jest.fn();
const publicationUpdateMany = jest.fn();
const publicationCreate = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => publicationFindMany(...args),
      update: jest.fn().mockResolvedValue({}),
      updateMany: (...args: unknown[]) => publicationUpdateMany(...args),
      create: (...args: unknown[]) => publicationCreate(...args),
      groupBy: jest.fn().mockResolvedValue([]),
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

jest.mock("@/lib/marketing/planner", () => ({
  __esModule: true,
  marketingPlannerEnabled: () => true,
  planTopicsForSlots: () => new Map([["b610-2w-telegram-20260812-01", {
    cluster: "расставание и возврат",
    articleSlug: "kak-perezhit-rasstavanie-s-lyubimym",
    targetQuery: "как пережить расставание",
    origin: "trend",
    rationale: "Тема из живого тренда (возврат после расставания).",
  }]]),
}));

jest.mock("@/lib/marketing/trend-scan", () => ({
  __esModule: true,
  scanTrends: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/search-marketing-data", () => ({
  __esModule: true,
  cachedWordstatWatchlist: jest.fn().mockResolvedValue([]),
}));

import { generateMarketingDrafts } from "@/lib/marketing/publication-queue";
import { contentPlanFor } from "@/lib/marketing/content-plan";

const NOW = new Date("2026-08-11T10:00:00.000Z");

beforeEach(() => {
  publicationFindMany.mockReset().mockResolvedValue([]);
  publicationUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  publicationCreate.mockReset().mockResolvedValue({});
});

describe("B702 фаза 4 — планировщик в генераторе черновиков", () => {
  it("тема свободного слота приходит от планировщика, а не из константы TOPICS", async () => {
    const slot = contentPlanFor(NOW).find((entry) => entry.channel === "telegram")!;
    expect(slot).toBeDefined();

    const result = await generateMarketingDrafts({ now: NOW, target: 1 });

    const created = publicationCreate.mock.calls.map((call) => call[0].data);
    const row = created.find((item) => item.planSlot === slot.key);
    expect(row).toBeDefined();
    // В реестре тема живёт в targetQuery/cluster/utmContent (articleSlug не
    // пишется в схему): тема планировщика приехала целиком, не остовная.
    expect(row.targetQuery).toBe("как пережить расставание");
    expect(row.cluster).toBe("расставание и возврат");
    expect(row.utmContent).toBe("kak-perezhit-rasstavanie-s-lyubimym");
    const notes = JSON.parse(row.notes) as { topicOrigin: string; topicRationale: string };
    expect(notes.topicOrigin).toBe("trend");
    expect(notes.topicRationale).toContain("тренд");
    expect(result.plannedTopics).toEqual({ total: 1, byCore: 0, byTrend: 1 });
  });

  it("тема планировщика не занимает статью, уже занятую на площадке", async () => {
    const slot = contentPlanFor(NOW).find((entry) => entry.channel === "telegram")!;
    expect(slot).toBeDefined();

    // Первый запрос — занятые слоты на площадках с уникальными темами (dzen).
    // Второй — ключи поколений слотов. Оба вернутся пустыми, планировщик не
    // вызывается повторно — тема планировщика применяется напрямую.
    publicationFindMany.mockImplementation((args: { where?: { key?: { in?: string[] } } }) => {
      if (!args?.where?.key) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await generateMarketingDrafts({ now: NOW, target: 1 });

    const created = publicationCreate.mock.calls.map((call) => call[0].data);
    const row = created.find((item) => item.planSlot === slot.key);
    expect(row).toBeDefined();
    expect(row.targetQuery).toBe("как пережить расставание");
    expect(result.plannedTopics.total).toBe(1);
  });

  it("счётчики нулевые, когда планировщик не предложил ни одной темы", async () => {
    const result = await generateMarketingDrafts({ now: NOW, target: 0 });

    expect(result.plannedTopics).toEqual({ total: 0, byCore: 0, byTrend: 0 });
  });
});
