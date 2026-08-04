/**
 * B658 — исчерпанная ёмкость перестала жечь саму себя.
 *
 * Замер прода 2026-08-04 (журнал `eterapy-marketing-agent-1`): публикация
 * `cms5beiwo001b0vwk569i1p8u` обрабатывалась заново каждые ~70 секунд часами.
 * Каждый заход writer отрабатывал УСПЕШНО и списывал токены, после чего
 * reviewer падал на `AI feature daily token budget exceeded` по всем шести
 * провайдерам, и материал оставался черновиком до следующего тика.
 *
 * Причина — часовой шаг считал не попытки, а дошедшие до конца материалы:
 * `plannedThisHour` берётся по `agentReviewedAt`, а эта отметка на упавшем
 * материале не появляется. Счётчик оставался нулём, норма часа выглядела
 * нетронутой, и цикл брал ту же строку снова. Норма — 2 материала в час,
 * фактически шло около пятидесяти, и все — в тот же потолок.
 *
 * Прогон держит две границы: остывание существует и оно фейл-открытое.
 */

import {
  MARKETING_CAPACITY_COOLDOWN_MS,
  marketingCapacityCooldownActive,
} from "@/lib/marketing/agent";
import db from "@/lib/db";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { marketingAutomationSignal: { findFirst: jest.fn() } },
}));

const mockFindFirst = (db as unknown as {
  marketingAutomationSignal: { findFirst: jest.Mock };
}).marketingAutomationSignal.findFirst;

const NOW = new Date("2026-08-04T12:00:00.000Z");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("B658 · остывание после отказа по ёмкости", () => {
  it("свежий сигнал agent:capacity включает остывание", async () => {
    mockFindFirst.mockResolvedValue({ lastSeenAt: new Date(NOW.getTime() - 60_000) });
    await expect(marketingCapacityCooldownActive(NOW)).resolves.toBe(true);
  });

  it("сигнала нет — генерация идёт как обычно", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(marketingCapacityCooldownActive(NOW)).resolves.toBe(false);
  });

  it("окно остывания спрашивается у базы, а не подразумевается", async () => {
    mockFindFirst.mockResolvedValue(null);
    await marketingCapacityCooldownActive(NOW);
    const where = mockFindFirst.mock.calls[0][0].where;
    expect(where.key).toBe("agent:capacity");
    expect(where.status).toBe("OPEN");
    // Именно свежий сигнал: стухший не должен держать генерацию вечно.
    expect(where.lastSeenAt.gte.getTime())
      .toBe(NOW.getTime() - MARKETING_CAPACITY_COOLDOWN_MS);
  });

  it("сбой чтения сигнала не останавливает контур", async () => {
    // Вспомогательное действие не имеет права быть точкой отказа основного:
    // в худшем случае возвращается прежнее поведение, а не встаёт весь SMM.
    mockFindFirst.mockRejectedValue(new Error("db down"));
    await expect(marketingCapacityCooldownActive(NOW)).resolves.toBe(false);
  });

  it("окно по умолчанию — полчаса, один пропущенный слот часовой нормы", () => {
    expect(MARKETING_CAPACITY_COOLDOWN_MS).toBe(30 * 60_000);
  });
});
