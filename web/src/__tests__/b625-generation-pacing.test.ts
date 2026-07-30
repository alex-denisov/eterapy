/**
 * B625 — генерация привязана к слоту, а не к длине очереди.
 *
 * Замер прода 2026-07-30: цикл брал по три черновика каждую минуту по всей
 * очереди, отсортированной по плановой дате, поэтому суточная ёмкость уходила
 * на материалы вплоть до 7 августа, а публикации сегодняшнего дня ждали
 * полуночи. Тест держит границу окна: то, что выходит послезавтра, в работу
 * сегодня не берётся.
 */

import {
  MARKETING_GENERATION_LEAD_MS,
  marketingGenerationHorizon,
  runMarketingAgentCycle,
} from "@/lib/marketing/agent";

const findMany = jest.fn();
const count = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => findMany(...args),
      count: (...args: unknown[]) => count(...args),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    platformSetting: { findUnique: jest.fn().mockResolvedValue({ value: "true" }) },
    marketingAutomationSignal: { upsert: jest.fn(), updateMany: jest.fn() },
  },
}));

describe("B625 — окно опережения генерации", () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
    process.env.MARKETING_AGENT_ENABLED = "true";
    delete process.env.ETERAPY_CONTOUR;
  });

  it("горизонт отстоит от текущего момента ровно на окно опережения", () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    expect(marketingGenerationHorizon(now).getTime() - now.getTime())
      .toBe(MARKETING_GENERATION_LEAD_MS);
  });

  it("окно покрывает завтрашний день, но не всю двухнедельную очередь", () => {
    // Двухнедельный план — это ~11 материалов в сутки. Окно должно давать
    // writer работу на сегодня и завтра, иначе суточный потолок токенов снова
    // уедет на неделю вперёд.
    expect(MARKETING_GENERATION_LEAD_MS).toBeGreaterThanOrEqual(24 * 60 * 60_000);
    expect(MARKETING_GENERATION_LEAD_MS).toBeLessThan(3 * 24 * 60 * 60_000);
  });

  it("в выборку идут только черновики со слотом внутри окна и без слота вовсе", async () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    await runMarketingAgentCycle({ now });

    const where = findMany.mock.calls[0][0].where;
    const dueNow = where.AND[1];
    expect(dueNow.OR).toEqual([
      { scheduledFor: null },
      { scheduledFor: { lte: marketingGenerationHorizon(now) } },
    ]);
  });

  it("ответ на входящее не откладывается: у него нет плановой даты", async () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    await runMarketingAgentCycle({ now });
    const dueNow = findMany.mock.calls[0][0].where.AND[1];
    expect(dueNow.OR).toContainEqual({ scheduledFor: null });
  });

  it("отложенное считается и возвращается вызывающему, а не теряется молча", async () => {
    count.mockResolvedValue(87);
    const result = await runMarketingAgentCycle({ now: new Date("2026-07-30T12:00:00.000Z") });
    expect(result).toMatchObject({ enabled: true, processed: 0, deferred: 87 });
  });
});
