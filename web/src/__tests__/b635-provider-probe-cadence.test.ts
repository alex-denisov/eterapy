/**
 * B635 — обход провайдеров ровно раз в 15 минут и в одном ритме.
 *
 * Владелец 2026-07-31: «проверка идёт не каждые 15 минут, а хаотично — в
 * колонке „проверено“ время у каждого провайдера разное». Прогоны держат обе
 * части исправления: единый шаг и выравнивание по сетке.
 */

import { PROBE_INTERVAL_MS, providerProbeDue } from "@/lib/marketing/provider-health";

const SLOT_START = new Date("2026-07-31T10:00:00.000Z");

describe("B635 · ритм пробы провайдеров", () => {
  it("провайдер без единой отметки проверяется немедленно", () => {
    expect(providerProbeDue({
      now: SLOT_START,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
    })).toBe(true);
  });

  it("шаг один для всех: здоровый провайдер больше не ждёт час", () => {
    const healthyAt = new Date("2026-07-31T09:44:30.000Z");
    expect(providerProbeDue({
      now: SLOT_START,
      lastSuccessAt: healthyAt,
      lastErrorAt: null,
      lastErrorCode: null,
    })).toBe(true);
  });

  it("решение уровня аккаунта проверяется в том же ритме — новый ключ оживает без выкатки", () => {
    expect(providerProbeDue({
      now: SLOT_START,
      lastSuccessAt: null,
      lastErrorAt: new Date("2026-07-31T09:47:00.000Z"),
      lastErrorCode: "INSUFFICIENT_CREDITS",
    })).toBe(true);
  });

  it("внутри одного слота повторной пробы нет", () => {
    expect(providerProbeDue({
      now: new Date("2026-07-31T10:14:59.000Z"),
      lastSuccessAt: SLOT_START,
      lastErrorAt: null,
      lastErrorCode: null,
    })).toBe(false);
  });

  it("отметки не расползаются: длительность пробы не сдвигает следующую", () => {
    // Проба прошлого слота заняла 40 секунд и записалась в 09:45:40. При
    // отсчёте «прошлое время + 15 минут» следующая случилась бы в 10:00:40, и
    // за сутки колонка «проверено» разъехалась бы на минуты у каждой строки.
    const slow = new Date("2026-07-31T09:45:40.000Z");
    expect(providerProbeDue({
      now: new Date("2026-07-31T10:00:05.000Z"),
      lastSuccessAt: slow,
      lastErrorAt: null,
      lastErrorCode: null,
    })).toBe(true);
  });

  it("все провайдеры одного слота становятся due одновременно", () => {
    // Три провайдера, проверенные в разные секунды прошлого слота, обязаны
    // сойтись в один момент следующего — иначе колонка снова «хаотична».
    const checkedAt = [
      new Date("2026-07-31T09:45:02.000Z"),
      new Date("2026-07-31T09:52:31.000Z"),
      new Date("2026-07-31T09:59:58.000Z"),
    ];
    const now = new Date("2026-07-31T10:00:03.000Z");
    for (const lastSuccessAt of checkedAt) {
      expect(providerProbeDue({ now, lastSuccessAt, lastErrorAt: null, lastErrorCode: null })).toBe(true);
    }
  });

  it("шаг объявлен явно и равен пятнадцати минутам", () => {
    expect(PROBE_INTERVAL_MS).toBe(15 * 60_000);
  });
});
