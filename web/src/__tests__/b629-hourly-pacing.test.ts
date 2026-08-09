/**
 * B629 — часовой шаг генерации плана.
 *
 * Окно опережения B625 ограничило, ЧТО берётся в работу, но не ограничило, как
 * быстро: замер прода показал 78 генераций подряд за 2,5 часа, после чего сутки
 * шли без единой. Здесь проверяется, что плановая генерация идёт нормой в час, а
 * разговорная не подчиняется этому шагу вовсе.
 *
 * B700 фаза 2 — норму часа больше не задаёт константа: её считает
 * `conveyorTact` из спроса, запаса и ёмкости. Граница, которую держит этот
 * тест, от этого не изменилась: плановое пейсится, разговорное — нет. Изменился
 * второй адресат нормы — теперь она ограничивает ТОЛЬКО автора. Очередь
 * редактора (барабан) разбирается всегда, потому что доделать оплаченное
 * дешевле, чем начать новое.
 */

import { runMarketingAgentCycle } from "@/lib/marketing/agent";
import { CONVERSATIONAL_CONTENT_TYPES } from "@/lib/marketing/perimeter";

const findMany = jest.fn();
const count = jest.fn();

// Ёмкость пула здесь не предмет проверки: тест о такте, а не о ключах.
jest.mock("@/lib/marketing/pool-capacity", () => ({
  __esModule: true,
  marketingPoolAvailability: async () => ({
    providers: ["GROQ", "GEMINI"],
    canSeparateRoles: true,
  }),
  marketingHourlyCapacity: async () => ({
    perHour: 2,
    materialsLeftToday: 2,
    providers: ["GROQ", "GEMINI"],
    canSeparateRoles: true,
  }),
  marketingPoolResumeAt: async () => null,
}));

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

const now = new Date("2026-07-30T12:00:00.000Z");

describe("B629 · плановая генерация идёт нормой в час", () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
    process.env.MARKETING_AGENT_ENABLED = "true";
    delete process.env.ETERAPY_CONTOUR;
  });

  it("первым запросом идёт разговорное, а не плановое", async () => {
    await runMarketingAgentCycle({ now });
    const first = findMany.mock.calls[0][0].where.AND;
    expect(first).toContainEqual({ contentType: { in: [...CONVERSATIONAL_CONTENT_TYPES] } });
  });

  it("исчерпанный часовой шаг останавливает АВТОРА", async () => {
    // Норма часа уже израсходована: свежие черновики в работу не берутся.
    count.mockResolvedValue(8);
    const result = await runMarketingAgentCycle({ now });

    expect(result.tact.writerBudget).toBe(0);
    const wheres = findMany.mock.calls
      .map((call) => JSON.stringify(call[0].where ?? {}));
    expect(wheres.some((where) => where.includes('"agentWriterDraft":{"equals"'))).toBe(false);
  });

  it("исчерпанный шаг автора не останавливает очередь редактора", async () => {
    // Барабан разбирается своим бюджетом: доделать написанное стоит один вызов
    // и сразу превращает склад в готовое.
    count.mockResolvedValue(8);
    await runMarketingAgentCycle({ now });

    const wheres = findMany.mock.calls
      .map((call) => JSON.stringify(call[0].where ?? {}));
    expect(wheres.some((where) =>
      where.includes('"agentWriterDraft":{"not"'))).toBe(true);
  });

  it("исчерпанный шаг виден числом, а не пустой очередью", async () => {
    count.mockResolvedValue(8);
    const result = await runMarketingAgentCycle({ now });
    expect(result.paced).toBeGreaterThan(0);
  });

  it("свободный такт открывает выборку автора ровно на его бюджет", async () => {
    // Порядок счётчиков прохода: написано-за-час, отложено, ждёт-редактора,
    // СПРОС, готово-впереди. Спрос — единственное, что здесь не ноль: без него
    // писать нечего, и такт честно ответил бы нулём.
    count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4).mockResolvedValue(0);
    const result = await runMarketingAgentCycle({ now });
    const plannedCall = findMany.mock.calls.at(-1)?.[0];

    expect(result.tact.writerBudget).toBeGreaterThan(0);
    expect(plannedCall.take).toBe(result.tact.writerBudget);
    expect(plannedCall.where.AND).toContainEqual({
      NOT: { contentType: { in: [...CONVERSATIONAL_CONTENT_TYPES] } },
    });
    // Автор берёт только материал с ПУСТЫМ складом: написанное — забота редактора.
    expect(JSON.stringify(plannedCall.where)).toContain('"agentWriterDraft":{"equals"');
  });

  it("ответы не подчиняются часовому шагу: их берут при исчерпанной норме", async () => {
    count.mockResolvedValue(999);
    findMany.mockResolvedValue([{ id: "reply-1" }]);
    const result = await runMarketingAgentCycle({ now });
    expect(result.conversational).toBe(1);
  });
});
