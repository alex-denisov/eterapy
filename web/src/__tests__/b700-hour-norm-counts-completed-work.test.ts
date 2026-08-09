/**
 * B700 фаза 2 — норма часа не должна протекать в хорошем случае.
 *
 * Две неточности первой редакции фазы 2, обе про одно поле:
 *
 * 1. `writtenThisHour` считался по `agentWrittenAt >= час назад`, но
 *    терминальный исход (утверждён / забракован) обнулял `agentWrittenAt`.
 *    Материал, успевший пройти ОБЕ операции внутри часа, из счётчика исчезал —
 *    то есть чем быстрее линия доводит материал, тем больше сверх нормы она
 *    вправе начать. Норма протекала ровно в хорошем случае.
 *
 * 2. Очередь редактора выбиралась по `agentWrittenAt IS NOT NULL`, а частичный
 *    индекс фазы 1 построен по СКЛАДУ:
 *    `WHERE agent_writer_draft IS NOT NULL AND agent_reviewed_at IS NULL`.
 *    Из отметки времени наличие склада не следует, поэтому планировщик этот
 *    индекс использовать не мог.
 *
 * Правка одна на оба: очередь спрашивает про склад (это и есть её смысл — «есть
 * написанное, ждущее редактора»), а `agentWrittenAt` перестаёт обнуляться и
 * становится честной отметкой «когда автор произвёл этот текст».
 *
 * Границы, которые держит этот тест: счётчик часа видит завершённое, а очередь
 * редактора спрашивает склад, а не отметку времени.
 */

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
    marketingAutomationSignal: { upsert: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/marketing/pool-capacity", () => ({
  __esModule: true,
  marketingPoolAvailability: async () => ({ providers: ["GROQ", "GEMINI"], canSeparateRoles: true }),
  marketingHourlyCapacity: async () => ({
    perHour: 5,
    materialsLeftToday: 5,
    providers: ["GROQ", "GEMINI"],
    canSeparateRoles: true,
  }),
  marketingPoolResumeAt: async () => null,
}));

const now = new Date("2026-08-10T12:00:00.000Z");

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  count.mockReset().mockResolvedValue(0);
  process.env.MARKETING_AGENT_ENABLED = "true";
  delete process.env.ETERAPY_CONTOUR;
});

describe("B700 фаза 2 · норма часа и очередь редактора", () => {
  it("счётчик часа видит и незавершённое, и уже завершённое за этот час", async () => {
    const { runMarketingAgentCycle } = await import("@/lib/marketing/agent");
    await runMarketingAgentCycle({ now });

    const counted = count.mock.calls.map((call) => JSON.stringify(call[0].where));
    const hourly = counted.find((where) => where.includes("agentWrittenAt")
      && where.includes("gte")
      && where.includes("agentReviewedAt"));

    // Одно условие «или»: незавершённое по складу, завершённое по отметке
    // редактора. Пересечься они не могут — терминальный исход склад закрывает.
    expect(hourly).toBeDefined();
  });

  it("очередь редактора спрашивает СКЛАД, а не отметку времени", async () => {
    const { runMarketingAgentCycle } = await import("@/lib/marketing/agent");
    await runMarketingAgentCycle({ now });

    const wheres = findMany.mock.calls.map((call) => JSON.stringify(call[0].where ?? {}));
    // Частичный индекс фазы 1 построен ровно по этой паре условий.
    expect(wheres.some((where) => where.includes("agentWriterDraft")
      && where.includes("agentReviewedAt"))).toBe(true);
  });

  it("автор берёт материал без склада, а не без отметки времени", async () => {
    count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4).mockResolvedValue(0);

    const { runMarketingAgentCycle } = await import("@/lib/marketing/agent");
    await runMarketingAgentCycle({ now });

    const plannedCall = findMany.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(plannedCall.where)).toContain("agentWriterDraft");
  });
});
