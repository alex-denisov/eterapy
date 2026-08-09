/**
 * B700 фаза 2 — такт конвейера считается от спроса и ёмкости, а не константой.
 *
 * Что было. Темп линии задавали четыре числа, ни одно из которых не выведено
 * ни из плана, ни из остатка квот:
 *
 *   MARKETING_PLANNED_DRAFTS_PER_HOUR = 2      // 48 материалов в сутки при плане в 6–7
 *   MARKETING_GENERATION_LEAD_MS      = 30 ч
 *   MARKETING_CAPACITY_COOLDOWN_MS    = 30 мин
 *   DRAFT_QUEUE_TARGET                = длина плана ≈ 90
 *
 * «Два в час» не спрашивает ни сколько готового уже лежит впереди, ни сколько
 * токенов осталось до потолка. Замер прода 2026-08-09: 88 успешных генераций
 * автора за сутки при плане в 6–7 материалов и НУЛЕ публикаций.
 *
 * Требование владельца дословно: «прогнозирование объема должно работать в
 * зависимости от необходимого количества контента, который должен покрываться
 * циклами выпуска + запас … этот объем будет разбит в соответствии с лимитами
 * используемых моделей».
 *
 * Границы, которые держит этот тест:
 *   1. буфер полон → линия молчит и не тратит ничего;
 *   2. буфер пуст, ёмкость есть → линия догоняет, а не ждёт полуночи;
 *   3. ёмкость — потолок: спрос сверх неё не превращается в вызовы;
 *   4. барабан (очередь редактора) ограничивает автора, а не наоборот.
 */

import { conveyorTact, MARKETING_MAX_AWAITING_REVIEW } from "@/lib/marketing/conveyor-tact";

const base = {
  demand: 6,
  buffer: 4,
  ready: 0,
  hoursToHorizon: 30,
  capacityPerHour: 5,
  awaitingReview: 0,
  maxAwaitingReview: MARKETING_MAX_AWAITING_REVIEW,
};

describe("B700 фаза 2 — такт от спроса и ёмкости", () => {
  it("полный буфер останавливает автора: ноль вызовов, ноль трат", () => {
    const tact = conveyorTact({ ...base, demand: 6, buffer: 4, ready: 10 });

    expect(tact.perHour).toBe(0);
    expect(tact.writerBudget).toBe(0);
    expect(tact.bottleneck).toBe("buffer");
  });

  it("готового БОЛЬШЕ буфера — линия всё равно молчит, а не уходит в минус", () => {
    const tact = conveyorTact({ ...base, demand: 2, buffer: 4, ready: 40 });

    expect(tact.perHour).toBe(0);
    expect(tact.writerBudget).toBe(0);
  });

  it("пустой буфер и живая ёмкость — линия догоняет", () => {
    // Хотение — 10 материалов (спрос 6 + запас 4), но в окне лежит только 6:
    // дальняя часть запаса ещё не представлена строками. Норму задаёт спрос.
    const tact = conveyorTact({ ...base, demand: 6, buffer: 4, ready: 0, hoursToHorizon: 2 });

    expect(tact.perHour).toBe(3);
    expect(tact.writerBudget).toBe(3);
    expect(tact.bottleneck).toBe("demand");
  });

  it("спрос — верхняя граница нормы: писать больше, чем есть в окне, нельзя", () => {
    // Запас просит 40, но в окне два материала: норма часа не может быть выше.
    const tact = conveyorTact({
      ...base,
      demand: 2,
      buffer: 40,
      ready: 0,
      hoursToHorizon: 1,
      capacityPerHour: 99,
    });

    expect(tact.perHour).toBe(2);
  });

  it("ёмкость — потолок: спрос сверх неё не превращается в вызовы", () => {
    const tact = conveyorTact({
      ...base,
      demand: 40,
      buffer: 10,
      ready: 0,
      hoursToHorizon: 1,
      capacityPerHour: 3,
    });

    expect(tact.perHour).toBe(3);
    expect(tact.bottleneck).toBe("capacity");
  });

  it("нулевая ёмкость останавливает автора при любом спросе", () => {
    const tact = conveyorTact({ ...base, demand: 90, hoursToHorizon: 1, capacityPerHour: 0 });

    expect(tact.perHour).toBe(0);
    expect(tact.writerBudget).toBe(0);
    expect(tact.bottleneck).toBe("capacity");
  });

  it("барабан: полная очередь редактора запрещает автору производить впрок", () => {
    const tact = conveyorTact({
      ...base,
      demand: 40,
      hoursToHorizon: 1,
      capacityPerHour: 10,
      awaitingReview: MARKETING_MAX_AWAITING_REVIEW,
    });

    expect(tact.perHour).toBeGreaterThan(0);
    expect(tact.writerBudget).toBe(0);
    expect(tact.bottleneck).toBe("drum");
  });

  it("барабан отдаёт автору ровно свободные места очереди редактора", () => {
    const tact = conveyorTact({
      ...base,
      demand: 40,
      hoursToHorizon: 1,
      capacityPerHour: 10,
      awaitingReview: MARKETING_MAX_AWAITING_REVIEW - 2,
    });

    expect(tact.writerBudget).toBe(2);
    expect(tact.bottleneck).toBe("drum");
  });

  it("уже написанное в этот час вычитается из нормы часа", () => {
    const tact = conveyorTact({
      ...base,
      demand: 20,
      hoursToHorizon: 1,
      capacityPerHour: 6,
      writtenThisHour: 4,
    });

    expect(tact.perHour).toBe(6);
    expect(tact.writerBudget).toBe(2);
  });

  it("горизонт короче часа не делит на ноль и не даёт бесконечность", () => {
    const tact = conveyorTact({ ...base, demand: 4, buffer: 0, ready: 0, hoursToHorizon: 0 });

    expect(Number.isFinite(tact.perHour)).toBe(true);
    expect(tact.perHour).toBe(4);
  });

  it("отрицательные и дробные входы не ломают такт", () => {
    const tact = conveyorTact({
      ...base,
      demand: -5,
      buffer: 2.4,
      ready: -1,
      hoursToHorizon: -3,
      capacityPerHour: 2.7,
    });

    expect(Number.isInteger(tact.perHour)).toBe(true);
    expect(tact.perHour).toBeGreaterThanOrEqual(0);
    expect(tact.writerBudget).toBeGreaterThanOrEqual(0);
  });
});
