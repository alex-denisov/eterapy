import {
  STARS_RUB_RATE_FALLBACK,
  isStarsConfigured,
  parseStarsPayload,
  starsForKopecks,
  starsRubRate,
  starsInvoiceTitle,
  verifyStarsCharge,
} from "@/lib/payments/telegram-stars";

// B529 — оплата в Telegram Mini App звёздами.
//
// Правило площадки: цифровые товары внутри мини-аппа на iOS/Android продаются
// ТОЛЬКО за Stars. Внешняя платёжная ссылка там нарушает правила Telegram и
// сторов, поэтому Robokassa-рельс мини-апп закрывает не полностью.
//
// Экономика: Stars — не рубли. Курс обязан жить на транзакции, а не читаться
// в момент начисления: владелец может поменять его между оплатой и колбэком,
// и тогда мы начислили бы не то, что человек купил.

describe("B529 — курс и цена в звёздах", () => {
  it("округляет звёзды ВНИЗ — owner-решение 2026-07-22", () => {
    // Звезда — целое число, поэтому цена почти никогда не делится нацело.
    // Владелец выбрал округлять в меньшую сторону: разница ≤ одной звезды
    // (≈1.6 ₽), и она достаётся покупателю, а не платформе.
    // 790 ₽ при курсе 1.6 ₽/звезда = 493.75 → 493.
    expect(starsForKopecks(79000, 1.6)).toBe(493);
    // Ровное деление остаётся ровным — округление его не трогает.
    expect(starsForKopecks(16000, 1.6)).toBe(100);
  });

  it("никогда не даёт ноль звёзд за платную покупку", () => {
    // Telegram отвергает инвойс на 0 XTR — это была бы бесплатная выдача.
    expect(starsForKopecks(1, 1000)).toBe(1);
  });

  it("отвергает бессмысленный курс вместо тихой подстановки своего", () => {
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => starsForKopecks(79000, rate)).toThrow(/курс/i);
    }
  });

  it("берёт курс из окружения, а при его отсутствии — задокументированный запасной", () => {
    const prior = process.env.TELEGRAM_STARS_RUB_RATE;
    delete process.env.TELEGRAM_STARS_RUB_RATE;
    expect(starsRubRate()).toBe(STARS_RUB_RATE_FALLBACK);

    process.env.TELEGRAM_STARS_RUB_RATE = "2.5";
    expect(starsRubRate()).toBe(2.5);

    // Мусор в переменной не должен молча удешевлять покупку.
    process.env.TELEGRAM_STARS_RUB_RATE = "не число";
    expect(starsRubRate()).toBe(STARS_RUB_RATE_FALLBACK);

    if (prior === undefined) delete process.env.TELEGRAM_STARS_RUB_RATE;
    else process.env.TELEGRAM_STARS_RUB_RATE = prior;
  });
});

describe("B529 — payload инвойса", () => {
  it("payload — это invoiceId нашей транзакции", () => {
    expect(parseStarsPayload("eterapy:4210")).toBe(4210);
  });

  it("не принимает чужой или испорченный payload", () => {
    for (const payload of ["4210", "eterapy:", "eterapy:abc", "eterapy:-1", "eterapy:0", "", "other:4210"]) {
      expect(parseStarsPayload(payload)).toBeNull();
    }
  });
});

describe("B529 — сверка перед подтверждением платежа", () => {
  const transaction = {
    invoiceId: 4210,
    status: "PENDING" as const,
    currency: "XTR",
    userId: "user-1",
    metadata: { starsAmount: 494 } as Record<string, unknown>,
  };

  it("подтверждает, когда транзакция ждёт оплаты и сумма совпала", () => {
    expect(verifyStarsCharge({ transaction, chargedStars: 494 })).toEqual({ ok: true });
  });

  it("отказывает, когда Telegram списал не ту сумму", () => {
    // Единственный момент, когда мы ещё можем отказаться: после
    // successful_payment деньги уже списаны.
    const result = verifyStarsCharge({ transaction, chargedStars: 100 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/сумм/i);
  });

  it("отказывает по уже оплаченной транзакции, а не платит дважды", () => {
    const settled = { ...transaction, status: "SUCCEEDED" as const };
    const result = verifyStarsCharge({ transaction: settled, chargedStars: 494 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/оплач/i);
  });

  it("отказывает по неизвестной транзакции", () => {
    const result = verifyStarsCharge({ transaction: null, chargedStars: 494 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/не найден/i);
  });
});

describe("B529 — конфигурация", () => {
  it("рельс выключен без токена бота", () => {
    const prior = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(isStarsConfigured()).toBe(false);
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    expect(isStarsConfigured()).toBe(true);
    if (prior === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prior;
  });

  it("заголовок инвойса человекочитаемый, а не машинный ключ", () => {
    // В окне оплаты Telegram человек видит именно это.
    expect(starsInvoiceTitle("ETerapy: pack-10")).not.toContain("pack-10");
    expect(starsInvoiceTitle("ETerapy: pack-10").length).toBeGreaterThan(0);
    // Telegram обрезает заголовок на 32 символах.
    expect(starsInvoiceTitle("ETerapy: pack-10").length).toBeLessThanOrEqual(32);
  });
});
