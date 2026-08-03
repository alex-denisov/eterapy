/**
 * B643 — сгоревший слот контент-плана.
 *
 * Замер прода 2026-08-03: у Дзена двенадцать из тринадцати будущих слотов
 * заняты строками `FAILED` с исчерпанным бюджетом восстановления, черновиков
 * ноль. Слот в схеме уникален, а мёртвая строка держала его до тех пор, пока
 * его дата не пройдёт — то есть отдавала ноль материалов и молчала об этом.
 *
 * Граница, которую держат эти проверки: слот освобождает ТОЛЬКО технический
 * отказ. Решение редактора и safety-блок слот не освобождают — там материал
 * признан негодным по существу, и перевыпуск был бы обходом редактора.
 */

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

import {
  MAX_RECOVERY_ATTEMPTS,
  recoverFailedPublications,
} from "@/lib/marketing/registry-recovery";
import {
  MAX_SLOT_GENERATIONS,
  generateMarketingDrafts,
  slotKeyForGeneration,
} from "@/lib/marketing/publication-queue";
import { contentPlanFor } from "@/lib/marketing/content-plan";

const NOW = new Date("2026-08-03T18:00:00.000Z");
const FUTURE = new Date("2026-08-10T06:30:00.000Z");
const PAST = new Date("2026-08-01T06:30:00.000Z");

const TECHNICAL = "dzen publication omitted the required media brief";
const EDITORIAL = "Independent reviewer did not approve the draft in three rounds";

beforeEach(() => {
  publicationFindMany.mockReset().mockResolvedValue([]);
  publicationUpdate.mockReset().mockResolvedValue({});
  publicationUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  publicationCreate.mockReset().mockResolvedValue({});
  publicationGroupBy.mockReset().mockResolvedValue([]);
});

describe("мёртвая строка отпускает слот", () => {
  it("исчерпавшая бюджет строка архивируется сразу и освобождает слот", async () => {
    publicationFindMany.mockResolvedValue([{
      id: "pub-dzen-08-10",
      key: "b610-dzen-2026-08-10",
      platform: "dzen",
      scheduledFor: FUTURE,
      lastError: TECHNICAL,
      recoveryCount: MAX_RECOVERY_ATTEMPTS,
      attemptCount: 0,
      planSlot: "b610-dzen-2026-08-10",
    }]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.slotsReleased).toBe(1);
    const data = publicationUpdate.mock.calls[0][0].data;
    // Раньше строка ждала, пока её дата пройдёт, и слот всё это время не
    // отдавал ничего. Ждать нечего: повторов больше не будет.
    expect(data.status).toBe("ARCHIVED");
    expect(data.planSlot).toBeNull();
    expect(data.archiveReason).toContain("слот освобождён");
    // Причина не теряется: в кокпите строка остаётся со своей ошибкой.
    expect(data.archiveReason).toContain(TECHNICAL);
  });

  it("решение редактора слот не освобождает", async () => {
    publicationFindMany.mockResolvedValue([{
      id: "pub-rejected",
      key: "b610-vk-2026-08-10",
      platform: "vk",
      scheduledFor: FUTURE,
      lastError: EDITORIAL,
      recoveryCount: MAX_RECOVERY_ATTEMPTS,
      attemptCount: 0,
      planSlot: "b610-vk-2026-08-10",
    }]);

    const result = await recoverFailedPublications({ now: NOW });

    // Перевыпуск слота здесь означал бы «попробуем ещё раз, вдруг редактор
    // не заметит» — это обход редактора, а не восстановление.
    expect(result.slotsReleased).toBe(0);
    expect(publicationUpdate).not.toHaveBeenCalled();
  });

  it("пока бюджет не исчерпан, строка возвращается в работу, а не в архив", async () => {
    publicationFindMany.mockResolvedValue([{
      id: "pub-retry",
      key: "b610-dzen-2026-08-11",
      platform: "dzen",
      scheduledFor: FUTURE,
      lastError: TECHNICAL,
      recoveryCount: 0,
      attemptCount: 0,
      planSlot: "b610-dzen-2026-08-11",
    }]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.slotsReleased).toBe(0);
    expect(result.requeued).toBe(1);
    expect(publicationUpdate.mock.calls[0][0].data.status).toBe("DRAFT");
  });

  it("прошедший слот освобождать незачем — плана на вчера не бывает", async () => {
    publicationFindMany.mockResolvedValue([{
      id: "pub-late",
      key: "b610-dzen-2026-08-01",
      platform: "dzen",
      scheduledFor: PAST,
      lastError: TECHNICAL,
      recoveryCount: MAX_RECOVERY_ATTEMPTS,
      attemptCount: 0,
      planSlot: "b610-dzen-2026-08-01",
    }]);

    const result = await recoverFailedPublications({ now: NOW });

    expect(result.archived).toBe(1);
    expect(result.slotsReleased).toBe(0);
    expect(publicationUpdate.mock.calls[0][0].data.planSlot).toBeUndefined();
  });
});

describe("перевыпуск освободившегося слота", () => {
  it("первое поколение занимает слот собственным ключом", () => {
    expect(slotKeyForGeneration("b610-dzen-2026-08-10", 1)).toBe("b610-dzen-2026-08-10");
  });

  it("следующее поколение получает свой ключ — слот уникален, ключ тоже", () => {
    expect(slotKeyForGeneration("b610-dzen-2026-08-10", 2)).toBe("b610-dzen-2026-08-10--r2");
  });

  it("генератор перевыпускает слот, чья прошлая строка умерла", async () => {
    const plan = contentPlanFor(NOW);
    const slot = plan[0];
    publicationFindMany.mockImplementation((args: { where?: { key?: { in?: string[] } } }) => {
      // Первый запрос — занятые слоты; строка умерла и слот отпустила.
      if (!args?.where?.key) return Promise.resolve([]);
      // Второй — какие ключи этого слота уже заняты историей.
      return Promise.resolve([{ key: slot.key }]);
    });

    await generateMarketingDrafts({ now: NOW, target: 1 });

    const created = publicationCreate.mock.calls.map((call) => call[0].data);
    const forSlot = created.find((row) => row.planSlot === slot.key);
    expect(forSlot).toBeDefined();
    expect(forSlot.key).toBe(slotKeyForGeneration(slot.key, 2));
  });

  it("второй раз слот не перевыпускается: ёмкость не бесконечна", async () => {
    const plan = contentPlanFor(NOW);
    const slot = plan[0];
    const spent = Array.from(
      { length: MAX_SLOT_GENERATIONS + 1 },
      (_, index) => ({ key: slotKeyForGeneration(slot.key, index + 1) }),
    );
    publicationFindMany.mockImplementation((args: { where?: { key?: { in?: string[] } } }) => {
      if (!args?.where?.key) return Promise.resolve([]);
      return Promise.resolve(spent);
    });

    const result = await generateMarketingDrafts({ now: NOW, target: 1 });

    const created = publicationCreate.mock.calls.map((call) => call[0].data);
    expect(created.some((row) => row.planSlot === slot.key)).toBe(false);
    expect(result.exhaustedSlots).toContain(slot.key);
  });
});
