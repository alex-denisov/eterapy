/**
 * B645 — слот это окно, а невыпущенный материал переносится.
 *
 * Владелец 2026-08-03: «неправильно выставлять ARCHIVED, если статья не была
 * выпущена. Если она хорошая, нужно решедулить, а не отменять её вовсе. Логика
 * слотов должна быть с диапазоном времени: если в течение слота материал не
 * опубликовался, он идёт в следующий слот в соответствии с его категорией».
 *
 * Четыре границы держат эти прогоны:
 * — окно закрылось → перенос, а не выпуск задним числом;
 * — утверждённый текст → перенос, а не архив;
 * — переносить нечего (нет тела и отметки редактора) → прежняя дорога B643;
 * — решение редактора → по-прежнему архив: там материал негоден по существу.
 */

const publicationFindMany = jest.fn();
const publicationUpdate = jest.fn();
const publicationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const publicationGroupBy = jest.fn().mockResolvedValue([]);
const signalUpsert = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => publicationFindMany(...args),
      update: (...args: unknown[]) => publicationUpdate(...args),
      updateMany: (...args: unknown[]) => publicationUpdateMany(...args),
      groupBy: (...args: unknown[]) => publicationGroupBy(...args),
      count: jest.fn().mockResolvedValue(0),
    },
    platformSetting: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    marketingAutomationSignal: {
      upsert: (...args: unknown[]) => signalUpsert(...args),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock("@/lib/marketing/agent", () => ({
  __esModule: true,
  resolveMarketingSignal: jest.fn().mockResolvedValue(undefined),
  upsertMarketingSignal: (...args: unknown[]) => signalUpsert(...args),
}));

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: jest.fn().mockResolvedValue(true),
  marketingPlatformValue: jest.fn().mockResolvedValue("value"),
  requiredMarketingPlatformValue: jest.fn().mockResolvedValue("value"),
}));

import { publishScheduledMarketing } from "@/lib/marketing/publish";
import { recoverFailedPublications } from "@/lib/marketing/registry-recovery";
import {
  MAX_SLOT_DEFERRALS,
  SLOT_WINDOW_MS,
  isSlotWindowOpen,
  nextSlotCandidates,
  publicationFormat,
} from "@/lib/marketing/slot-window";
import { contentPlanFor } from "@/lib/marketing/content-plan";

const NOW = new Date("2026-08-03T18:00:00.000Z");
const TECHNICAL = "dzen publication omitted the required media brief";
const EDITORIAL = "Independent reviewer did not approve the draft in three rounds";

const dataOf = (call: unknown[]) => (call[0] as { data: Record<string, unknown> }).data;
const updatesWith = (field: string) => publicationUpdate.mock.calls
  .map(dataOf)
  .filter((data) => data[field] !== undefined);

beforeEach(() => {
  jest.clearAllMocks();
  publicationFindMany.mockResolvedValue([]);
  publicationUpdate.mockResolvedValue({});
  publicationUpdateMany.mockResolvedValue({ count: 1 });
  publicationGroupBy.mockResolvedValue([]);
});

describe("окно слота", () => {
  it("внутри окна слот действует, за окном — нет", () => {
    const slotAt = new Date("2026-08-03T05:30:00.000Z");
    expect(isSlotWindowOpen({ scheduledFor: slotAt, now: slotAt })).toBe(true);
    expect(isSlotWindowOpen({
      scheduledFor: slotAt,
      now: new Date(slotAt.getTime() + SLOT_WINDOW_MS - 1),
    })).toBe(true);
    expect(isSlotWindowOpen({
      scheduledFor: slotAt,
      now: new Date(slotAt.getTime() + SLOT_WINDOW_MS + 1),
    })).toBe(false);
  });

  it("у строки без времени окна нет вовсе — это не «окно закрылось»", () => {
    expect(isSlotWindowOpen({ scheduledFor: null, now: NOW })).toBe(true);
  });
});

describe("выбор следующего слота", () => {
  it("предпочитает тот же формат и никогда не уводит в чужой канал", () => {
    const plan = contentPlanFor(NOW);
    const morning = plan.find((slot) =>
      slot.channel === "telegram" && slot.format === "утренняя символическая карточка");
    expect(morning).toBeDefined();

    const candidates = nextSlotCandidates({
      platform: "telegram",
      format: "утренняя символическая карточка",
      now: NOW,
      takenSlotKeys: [],
      plan,
    });

    expect(candidates[0].format).toBe("утренняя символическая карточка");
    expect(candidates.every((slot) => slot.channel === "telegram")).toBe(true);
  });

  it("занятые слоты и слоты в прошлом не предлагаются", () => {
    const plan = contentPlanFor(NOW);
    const free = nextSlotCandidates({
      platform: "vk",
      format: null,
      now: NOW,
      takenSlotKeys: [],
      plan,
    });
    const withoutFirst = nextSlotCandidates({
      platform: "vk",
      format: null,
      now: NOW,
      takenSlotKeys: [free[0].key],
      plan,
    });

    expect(withoutFirst[0].key).not.toBe(free[0].key);
    expect(free.every((slot) => new Date(slot.scheduledAt).getTime() > NOW.getTime())).toBe(true);
  });

  it("формат читается из заметок строки, а мусор не роняет разбор", () => {
    expect(publicationFormat(JSON.stringify({ format: "дневная мини-практика" })))
      .toBe("дневная мини-практика");
    expect(publicationFormat("не json")).toBeNull();
    expect(publicationFormat(null)).toBeNull();
  });
});

describe("выпуск не идёт задним числом", () => {
  const scheduledRow = (overrides: Record<string, unknown> = {}) => ({
    id: "pub-late",
    key: "b610-2w-telegram-20260803-01",
    title: "Утренняя карточка",
    body: "Текст материала достаточной длины.",
    platform: "telegram",
    contentType: "POST",
    mediaUrl: null,
    notes: JSON.stringify({ format: "утренняя символическая карточка" }),
    planSlot: "b610-2w-telegram-20260803-01",
    scheduledFor: new Date(NOW.getTime() - SLOT_WINDOW_MS - 60_000),
    deferralCount: 0,
    engagementTargetId: null,
    engagementTargetUrl: null,
    inboundReplyToId: null,
    inboundReplyTo: null,
    ...overrides,
  });

  it("материал с закрытым окном переезжает в следующий слот, а не выходит ночью", async () => {
    publicationFindMany
      .mockResolvedValueOnce([scheduledRow()])
      .mockResolvedValue([]);
    const adapter = jest.fn();

    const result = await publishScheduledMarketing({
      now: NOW,
      enabled: true,
      adapters: { telegram: adapter },
    });

    expect(adapter).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
    const moved = updatesWith("planSlot")[0];
    expect(moved.status).toBe("SCHEDULED");
    expect(moved.planSlot).not.toBe("b610-2w-telegram-20260803-01");
    expect((moved.scheduledFor as Date).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("пауза канала переносу не мешает: материал получает осмысленное время", async () => {
    // Замер прода 2026-08-03: материал Instagram простоял двое суток на паузе
    // канала и вышел бы в произвольную минуту возврата доступа.
    publicationFindMany
      .mockResolvedValueOnce([scheduledRow({
        platform: "instagram",
        scheduledFor: new Date(NOW.getTime() - 48 * 3_600_000),
      })])
      .mockResolvedValue([]);
    const adapter = jest.fn();

    const result = await publishScheduledMarketing({
      now: NOW,
      enabled: true,
      adapters: { instagram: adapter },
    });

    expect(result.deferred).toBe(1);
    expect(adapter).not.toHaveBeenCalled();
    expect(updatesWith("planSlot")[0].status).toBe("SCHEDULED");
  });

  it("внутри окна материал выходит как прежде", async () => {
    publicationFindMany
      .mockResolvedValueOnce([scheduledRow({
        scheduledFor: new Date(NOW.getTime() - 10 * 60_000),
      })])
      .mockResolvedValue([]);
    const adapter = jest.fn().mockResolvedValue({ externalPostId: "42", publicUrl: null });

    const result = await publishScheduledMarketing({
      now: NOW,
      enabled: true,
      adapters: { telegram: adapter },
    });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(result.deferred).toBe(0);
  });

  it("ответ живому человеку в слот не переносится — у него слота нет", async () => {
    publicationFindMany
      .mockResolvedValueOnce([scheduledRow({
        platform: "vk",
        contentType: "COMMENT",
        planSlot: null,
        scheduledFor: new Date(NOW.getTime() - 5 * 24 * 3_600_000),
        engagementTargetId: "-1_2",
        engagementTargetUrl: "https://vk.com/wall-1_2?reply=3",
      })])
      .mockResolvedValue([]);
    const adapter = jest.fn().mockResolvedValue({ externalPostId: "43", publicUrl: null });

    const result = await publishScheduledMarketing({
      now: NOW,
      enabled: true,
      adapters: { vk: adapter },
    });

    // Ответ не переносится и не получает слота: он либо уходит, либо остаётся
    // в очереди — но никогда не ждёт «следующего утра».
    expect(result.deferred).toBe(0);
    expect(updatesWith("planSlot")).toHaveLength(0);
  });
});

describe("утверждённый материал не архивируется", () => {
  const failedRow = (overrides: Record<string, unknown> = {}) => ({
    id: "pub-failed",
    key: "b610-2w-dzen-20260802-01",
    platform: "dzen",
    scheduledFor: new Date(NOW.getTime() - 6 * 3_600_000),
    lastError: TECHNICAL,
    recoveryCount: 2,
    attemptCount: 1,
    planSlot: "b610-2w-dzen-20260802-01",
    body: "Готовая статья, утверждённая редактором.",
    notes: JSON.stringify({ format: "структурированная статья" }),
    agentReviewedAt: new Date(NOW.getTime() - 7 * 3_600_000),
    deferralCount: 0,
    ...overrides,
  });

  it("статья, чей слот прошёл, переносится в следующий слот своего канала", async () => {
    publicationFindMany
      .mockResolvedValueOnce([failedRow()])
      .mockResolvedValue([]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.deferredToNextSlot).toBe(1);
    expect(result.archived).toBe(0);
    const moved = updatesWith("planSlot")[0];
    expect(moved.status).toBe("SCHEDULED");
    expect(moved.planSlot).toMatch(/^b610-2w-dzen-/);
    expect(updatesWith("archiveReason")).toHaveLength(0);
  });

  it("исчерпав право на перенос, материал ждёт в очереди — архива нет и здесь", async () => {
    publicationFindMany
      .mockResolvedValueOnce([failedRow({ deferralCount: MAX_SLOT_DEFERRALS })])
      .mockResolvedValue([]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.stuckInQueue).toBe(1);
    expect(result.archived).toBe(0);
    expect(dataOf(publicationUpdate.mock.calls[0]).status).toBe("SCHEDULED");
    expect(signalUpsert).toHaveBeenCalledWith(expect.objectContaining({
      key: "plan-deferral:pub-failed",
    }));
  });

  it("строка без тела и без отметки редактора идёт прежней дорогой B643", async () => {
    publicationFindMany
      .mockResolvedValueOnce([failedRow({
        body: null,
        agentReviewedAt: null,
        scheduledFor: new Date(NOW.getTime() + 48 * 3_600_000),
      })])
      .mockResolvedValue([]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.deferredToNextSlot).toBe(0);
    expect(result.slotsReleased).toBe(1);
    expect(dataOf(publicationUpdate.mock.calls[0]).status).toBe("ARCHIVED");
  });

  it("решение редактора по-прежнему ведёт в архив: материал негоден по существу", async () => {
    publicationFindMany
      .mockResolvedValueOnce([failedRow({ lastError: EDITORIAL })])
      .mockResolvedValue([]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.deferredToNextSlot).toBe(0);
    expect(result.archived).toBe(1);
    expect(dataOf(publicationUpdate.mock.calls[0]).status).toBe("ARCHIVED");
  });
});
