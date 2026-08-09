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

  it("остывание спрашивается у базы по открытому сигналу", async () => {
    mockFindFirst.mockResolvedValue(null);
    await marketingCapacityCooldownActive(NOW);
    const where = mockFindFirst.mock.calls[0][0].where;
    expect(where.key).toBe("agent:capacity");
    expect(where.status).toBe("OPEN");
    /**
     * B700 фаза 3 — отсечки по свежести здесь БОЛЬШЕ НЕТ, и это осознанно.
     *
     * Срок ожидания теперь называет провайдер (`cooldownUntil`, B699), и он
     * бывает длиннее плоских 30 минут: Groq на исчерпанном суточном потолке
     * говорит «через 59 минут». Отсечка `lastSeenAt >= now − 30 мин` обнуляла
     * бы паузу раньше её собственного конца, и линия шла бы ломиться в тот же
     * мёртвый ключ дважды за час.
     *
     * То, что отсечка защищала, держится ниже двумя проверками: стухший сигнал
     * без срока не держит линию, и чужая дата не усыпляет её дольше суток.
     */
    expect(where.lastSeenAt).toBeUndefined();
  });

  it("стухший сигнал без срока провайдера не держит генерацию", async () => {
    // Час молчания при плоском окне в полчаса: пауза истекла сама.
    mockFindFirst.mockResolvedValue({ lastSeenAt: new Date(NOW.getTime() - 60 * 60_000) });
    await expect(marketingCapacityCooldownActive(NOW)).resolves.toBe(false);
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
