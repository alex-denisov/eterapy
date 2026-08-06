/**
 * B696 — у строки без времени выпуска не было дороги обратно.
 *
 * Замер реестра прода 2026-08-06: четыре строки `FAILED` с пустым
 * `scheduled_for` лежат с 04.08 и не двигаются. Причина в том, что все три
 * дороги восстановления требуют времени: `slotAhead` считается как
 * `Boolean(row.scheduledFor && …)` и у такой строки ложен ВСЕГДА, а архив по
 * прошедшему сроку тоже начинается с `row.scheduledFor`.
 *
 * Опасность не в четырёх строках, а в классе: без времени выпуска живут ОТВЕТЫ
 * ЖИВЫМ ЛЮДЯМ (B616) — у них нет слота намеренно. Технический отказ такого
 * ответа означал, что человеку не ответят никогда.
 *
 * Строка без времени — не «просроченная», а «выходящая сразу»: возврат
 * немедленный, тем же счётчиком восстановлений, а исчерпав его — архив с
 * причиной, потому что молча висеть `FAILED` не должна ни одна строка.
 */

const publicationFindMany = jest.fn();
const publicationUpdate = jest.fn();
const publicationGroupBy = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => publicationFindMany(...args),
      update: (...args: unknown[]) => publicationUpdate(...args),
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

import {
  MAX_RECOVERY_ATTEMPTS,
  recoverFailedPublications,
} from "@/lib/marketing/registry-recovery";

const NOW = new Date("2026-08-06T18:00:00.000Z");

const rowWithoutSlot = (overrides: Record<string, unknown> = {}) => ({
  id: "pub-inbound",
  key: "smm-reply-1",
  platform: "vk",
  scheduledFor: null,
  planSlot: null,
  lastError: "No free provider returned valid structured output (GROQ: All AI providers failed)",
  recoveryCount: 0,
  attemptCount: 0,
  body: null,
  notes: null,
  agentReviewedAt: null,
  deferralCount: 0,
  ...overrides,
});

beforeEach(() => {
  publicationFindMany.mockReset().mockResolvedValue([]);
  publicationUpdate.mockReset().mockResolvedValue({});
  publicationGroupBy.mockReset().mockResolvedValue([]);
});

describe("строка без времени выпуска", () => {
  it("возвращается в работу немедленно: ждать ей нечего", async () => {
    publicationFindMany.mockResolvedValue([rowWithoutSlot()]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.requeued).toBe(1);
    const data = publicationUpdate.mock.calls[0][0].data;
    expect(data.status).toBe("DRAFT");
    expect(data.attemptCount).toBe(0);
    expect(data.recoveryCount).toEqual({ increment: 1 });
    // Времени ей не назначают: строка выходит на ближайшем проходе, а не «к утру».
    expect(data.scheduledFor).toBeUndefined();
  });

  it("исчерпав попытки, уходит в архив с причиной, а не висит FAILED", async () => {
    publicationFindMany.mockResolvedValue([
      rowWithoutSlot({ recoveryCount: MAX_RECOVERY_ATTEMPTS }),
    ]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.requeued).toBe(0);
    expect(result.archived).toBe(1);
    const data = publicationUpdate.mock.calls[0][0].data;
    expect(data.status).toBe("ARCHIVED");
    expect(data.archiveReason).toContain("восстановлен");
  });

  it("решение редактора остаётся приговором и без времени выпуска", async () => {
    publicationFindMany.mockResolvedValue([
      rowWithoutSlot({ lastError: "Independent reviewer did not approve the draft in three rounds" }),
    ]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.requeued).toBe(0);
    const data = publicationUpdate.mock.calls[0]?.[0]?.data;
    expect(data?.status).not.toBe("DRAFT");
  });
});
