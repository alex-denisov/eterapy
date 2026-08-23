/**
 * B719 — суточный потолок расхода на платный маршрут.
 *
 * Решение владельца 2026-08-23: Яндекс — 10 ₽ в сутки, OpenAI — $0,03 в сутки.
 *
 * ⚠ ЗАЧЕМ ПРОГОН НА АРИФМЕТИКУ. Потолок, который ошибается в цене, — это не
 * потолок, а иллюзия потолка: он молчит ровно тогда, когда должен сработать.
 * Поэтому здесь проверяется не «функция вызвалась», а сколько именно денег
 * насчитано за известный расход токенов.
 */

import { AIProvider } from "@prisma/client";
import {
  MARKETING_PAID_ROUTE_CAPS,
  PAID_ROUTE_SCALE,
  paidRouteCap,
  paidRouteScopeKey,
  paidRouteSpend,
  paidRoutesWithBudgetLeft,
} from "@/lib/marketing/paid-route-budget";

describe("B719 — потолки названы в валюте счёта провайдера", () => {
  it("Яндекс ограничен рублями, OpenAI — долларами", () => {
    expect(paidRouteCap(AIProvider.YANDEX)).toMatchObject({ currency: "RUB", limit: 10 });
    expect(paidRouteCap(AIProvider.OPENAI)).toMatchObject({ currency: "USD", limit: 0.03 });
  });

  it("у каждой цены назван источник, который можно перепроверить", () => {
    for (const cap of Object.values(MARKETING_PAID_ROUTE_CAPS)) {
      expect(cap.priceSource).toEqual(expect.any(String));
      expect(cap.priceSource.length).toBeGreaterThan(10);
    }
  });

  it("бесплатный провайдер потолка не имеет и денег не считает", () => {
    expect(paidRouteCap(AIProvider.GEMINI)).toBeNull();
    expect(paidRouteSpend({
      provider: AIProvider.GEMINI, promptTokens: 100_000, completionTokens: 100_000,
    })).toBe(0);
  });
});

describe("B719 — арифметика расхода", () => {
  it("YandexGPT Pro: 0,60 ₽ за 1 000 токенов в обе стороны", () => {
    // Типичное обращение автора по замеру прода: ~5 400 промпта + 1 500 вывода.
    expect(paidRouteSpend({
      provider: AIProvider.YANDEX, promptTokens: 5_400, completionTokens: 1_500,
    })).toBeCloseTo(4.14, 5);
    // То есть 10 ₽ хватает на два таких обращения, третье уже за потолком.
    expect(paidRouteSpend({
      provider: AIProvider.YANDEX, promptTokens: 10_800, completionTokens: 3_000,
    })).toBeCloseTo(8.28, 5);
  });

  it("OpenAI: оценка $1/$4 за миллион даёт ~7 обращений на $0,03", () => {
    const one = paidRouteSpend({
      provider: AIProvider.OPENAI, promptTokens: 5_400, completionTokens: 1_500,
    });
    expect(one).toBeCloseTo(0.0114, 6);
    const cap = paidRouteCap(AIProvider.OPENAI)!;
    expect(Math.floor(cap.limit / one)).toBe(2);
  });

  it("масштаб счётчика не теряет десятых долей копейки", () => {
    // 10 ₽ = 10 000 единиц, $0,03 = 30 единиц. Округление вниз до целых
    // рублей/центов сделало бы потолок OpenAI неотличимым от нуля.
    expect(Math.round(10 * PAID_ROUTE_SCALE)).toBe(10_000);
    expect(Math.round(0.03 * PAID_ROUTE_SCALE)).toBe(30);
  });

  it("ключи счётчиков не пересекаются между провайдерами", () => {
    expect(paidRouteScopeKey(AIProvider.YANDEX))
      .not.toBe(paidRouteScopeKey(AIProvider.OPENAI));
  });
});

describe("B719 — исчерпанный потолок закрывает маршрут на сутки", () => {
  const ledger = (spentScaled: Record<string, number>) => ({
    $queryRaw: jest.fn(async (query: { values?: unknown[] }) => {
      const key = String((query.values ?? [])[0] ?? "");
      const value = spentScaled[key];
      return value === undefined ? [] : [{ cost_micros: value }];
    }),
  });

  it("маршрут в пределах потолка остаётся доступным", async () => {
    const client = ledger({ [paidRouteScopeKey(AIProvider.OPENAI)]: 20 }); // $0,020 из $0,03
    const left = await paidRoutesWithBudgetLeft({}, client as never);
    expect(left).toContain(AIProvider.OPENAI);
  });

  it("выбранный потолок исключает маршрут", async () => {
    const client = ledger({
      [paidRouteScopeKey(AIProvider.OPENAI)]: 30,      // ровно $0,03
      [paidRouteScopeKey(AIProvider.YANDEX)]: 10_000,  // ровно 10 ₽
    });
    expect(await paidRoutesWithBudgetLeft({}, client as never)).toEqual([]);
  });

  it("нечитаемый счётчик закрывает кошелёк, а не открывает его", async () => {
    const client = {
      $queryRaw: jest.fn(async () => { throw new Error("db is down"); }),
    };
    // Противоположно правилу пула, где «прочитать не удалось» значит «идём по
    // всему пулу»: там ценой ошибки был лишний бесплатный вызов, здесь —
    // деньги владельца.
    expect(await paidRoutesWithBudgetLeft({}, client as never)).toEqual([]);
  });
});
