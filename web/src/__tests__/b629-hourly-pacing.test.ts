/**
 * B629 — часовой шаг генерации плана.
 *
 * Окно опережения B625 ограничило, ЧТО берётся в работу, но не ограничило, как
 * быстро: замер прода показал 78 генераций подряд за 2,5 часа, после чего сутки
 * шли без единой. Здесь проверяется, что плановая генерация идёт нормой в час, а
 * разговорная не подчиняется этому шагу вовсе.
 */

import {
  MARKETING_PLANNED_DRAFTS_PER_HOUR,
  runMarketingAgentCycle,
} from "@/lib/marketing/agent";
import { CONVERSATIONAL_CONTENT_TYPES } from "@/lib/marketing/perimeter";

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

  it("исчерпанный часовой шаг останавливает плановую генерацию", async () => {
    // Норма часа уже израсходована — плановых запросов быть не должно.
    count.mockResolvedValue(MARKETING_PLANNED_DRAFTS_PER_HOUR);
    const result = await runMarketingAgentCycle({ now });

    expect(result.planned).toBe(0);
    // Единственная выборка — разговорная: плановую мы даже не запрашиваем.
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("исчерпанный шаг виден числом, а не пустой очередью", async () => {
    count.mockResolvedValue(MARKETING_PLANNED_DRAFTS_PER_HOUR);
    const result = await runMarketingAgentCycle({ now });
    expect(result.paced).toBeGreaterThan(0);
  });

  it("свободный шаг открывает плановую выборку с остатком нормы", async () => {
    count.mockResolvedValue(0);
    await runMarketingAgentCycle({ now });
    const plannedCall = findMany.mock.calls.at(-1)?.[0];
    expect(plannedCall.take).toBe(MARKETING_PLANNED_DRAFTS_PER_HOUR);
    expect(plannedCall.where.AND).toContainEqual({
      NOT: { contentType: { in: [...CONVERSATIONAL_CONTENT_TYPES] } },
    });
  });

  it("ответы не подчиняются часовому шагу: их берут при исчерпанной норме", async () => {
    count.mockResolvedValue(999);
    findMany.mockResolvedValue([{ id: "reply-1" }]);
    const result = await runMarketingAgentCycle({ now });
    expect(result.conversational).toBe(1);
  });
});
