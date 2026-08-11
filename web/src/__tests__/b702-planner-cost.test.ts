/**
 * B702 — цена прохода планировщика на ЖИВЫХ данных.
 *
 * Остальные прогоны B702 работают на контролируемой библиотеке из трёх статей и
 * снимке спроса из одной фразы: так проверяется решение, но не его цена.
 * Настоящий вход другой — 1750 фраз семантического ядра против 174 одобренных
 * статей библиотеки, и планировщик зовёт scorer по каждой строке кандидата.
 *
 * Замер 2026-08-11 до правки: 16 секунд на восемь слотов — матчер спроса
 * пересобирался (стемминг всех 1750 фраз) на КАЖДЫЙ вызов scorer'а. Проход
 * крона столько не ждёт, а тесты на моках этого не видят вовсе. Отсюда бюджет
 * ниже: он ловит возврат квадратичной сборки, а не микросекунды.
 */

import { demandFromCore, mergeDemandSignals } from "@/lib/marketing/content-relevance";
import { planTopicsForSlots } from "@/lib/marketing/planner";
import { CONTENT_PLAN } from "@/lib/marketing/content-plan";

/** Потолок прохода планировщика на живом входе. После правки — доли секунды. */
const PLANNER_BUDGET_MS = 3_000;

describe("B702 — планировщик на живом ядре и живой библиотеке", () => {
  it(`восемь слотов планируются быстрее ${PLANNER_BUDGET_MS} мс`, () => {
    const signals = mergeDemandSignals([demandFromCore()]);
    expect(signals.items.length).toBeGreaterThan(1_000);

    const slots = CONTENT_PLAN.slice(0, 8);
    const started = Date.now();
    const planned = planTopicsForSlots({
      slots,
      signals,
      trends: [],
      usedByPlatform: new Map(),
    });
    const elapsed = Date.now() - started;

    expect(planned.size).toBe(slots.length);
    expect(elapsed).toBeLessThan(PLANNER_BUDGET_MS);
  });
});
