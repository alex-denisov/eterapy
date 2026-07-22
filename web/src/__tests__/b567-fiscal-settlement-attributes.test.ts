/**
 * B567 — фискальная развилка по авансу закрыта owner-решением 2026-07-22.
 *
 * Дословно: «платеж за сессии будет как "предоплата 100%". нужно везде обновить
 * сведения, что у нас нет частичного возврата за неявку клиента или позднюю
 * отмену (позднее чем за 24 часа до начала сессии), возврат только при неявке
 * специалиста. Баллы и подписки проводятся как полная оплата».
 *
 * ПОЧЕМУ это закрывает долг по 54-ФЗ. Признак `advance` порождал обязанность
 * пробить ВТОРОЙ чек в момент, когда балл потрачен на услугу, — а посчитать его
 * сумму было нечем: реестр баллов сливает лоты по `(source, expiresAt)` и
 * теряет связь с конкретной покупкой (разбор в work-log B567). Полная оплата
 * второго чека не требует вовсе: доступ к услугам выдаётся в момент зачисления
 * баллов, то есть услуга оказана сразу (оферта §5.8).
 *
 * Сессия — другой случай: деньги вносятся до встречи, и сумма ИЗВЕСТНА (цена
 * сессии), поэтому предоплата 100% здесь исполнима, в отличие от баллов.
 */
import {
  FISCAL_SETTLEMENT_SUBJECTS,
  fiscalSettlementFor,
  requiresClosingReceipt,
} from "@/lib/payments/fiscal";
import {
  LATE_CANCEL_RETENTION_PERCENT,
  penaltyKopecks,
} from "@/lib/booking-change-rules";

describe("B567 — признаки расчёта в чеке", () => {
  it("проводит баллы как полную оплату, а не как аванс", () => {
    expect(fiscalSettlementFor("credits")).toEqual({
      paymentObject: "service",
      paymentMethod: "full_payment",
    });
  });

  it("проводит подписку как полную оплату", () => {
    expect(fiscalSettlementFor("subscription")).toEqual({
      paymentObject: "service",
      paymentMethod: "full_payment",
    });
  });

  it("проводит сессию как предоплату 100%", () => {
    expect(fiscalSettlementFor("session")).toEqual({
      paymentObject: "service",
      paymentMethod: "full_prepayment",
    });
  });

  it("нигде не оставляет признак `advance` — это и была закрытая развилка", () => {
    for (const subject of FISCAL_SETTLEMENT_SUBJECTS) {
      expect(fiscalSettlementFor(subject).paymentMethod).not.toBe("advance");
    }
  });

  it("требует закрывающий чек только там, где расчёт не полный", () => {
    // Единственный признак, порождающий обязанность по второму чеку.
    expect(requiresClosingReceipt("session")).toBe(true);
    expect(requiresClosingReceipt("credits")).toBe(false);
    expect(requiresClosingReceipt("subscription")).toBe(false);
    expect(requiresClosingReceipt("product")).toBe(false);
  });
});

describe("B567 — нет частичного возврата за отмену и неявку клиента", () => {
  it("удерживает всю цену сессии, а не долю", () => {
    expect(LATE_CANCEL_RETENTION_PERCENT).toBe(100);
    // 3 000 ₽ сессии → удержано 3 000 ₽, возвращать нечего.
    expect(penaltyKopecks(3000)).toBe(300_000);
  });

  it("не даёт окружению хоста сделать возврат частичным", () => {
    // Правило опубликовано в оферте. Значение на хосте, способное вернуть
    // частичный возврат, разошлось бы с текстом, который принял клиент, — и
    // разошлось бы молча (готча B566: конфигурация мимо выкатки).
    const prior = process.env.BOOKING_LATE_CANCEL_PENALTY_PERCENT;
    process.env.BOOKING_LATE_CANCEL_PENALTY_PERCENT = "50";
    try {
      expect(penaltyKopecks(3000)).toBe(300_000);
    } finally {
      if (prior === undefined) delete process.env.BOOKING_LATE_CANCEL_PENALTY_PERCENT;
      else process.env.BOOKING_LATE_CANCEL_PENALTY_PERCENT = prior;
    }
  });
});
