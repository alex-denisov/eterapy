/**
 * B583 — модель выплат под ограничения Robokassa (owner 2026-07-26).
 *
 * Robokassa сообщила две вещи: механизма отложенной выплаты нет (есть только
 * холдирование платежа клиента), и сплитовать можно ТОЛЬКО на аккаунт
 * Robokassa получателя.
 *
 * Тесты закрепляют то, что уже можно закрепить, — готовность к сплиту и
 * границу применимости холда. Само движение денег не реализовано: контракта
 * API сплита/выплат нет, и провайдер по-прежнему падает закрыто (B562 шаг 2).
 */
import {
  ROBOKASSA_HOLD_MAX_DAYS,
  evaluateSplitReadiness,
  holdCoversBooking,
  normalizeRobokassaAccount,
} from "@/lib/payments/robokassa-split";
import { robokassaPayoutProvider } from "@/lib/payments/payout-provider";

describe("B583 — идентификатор аккаунта Robokassa", () => {
  it("принимает обычные идентификаторы", () => {
    expect(normalizeRobokassaAccount("eterapy-ivanova")).toBe("eterapy-ivanova");
    expect(normalizeRobokassaAccount("  shop_42  ")).toBe("shop_42");
    expect(normalizeRobokassaAccount("A.B-c_1")).toBe("A.B-c_1");
  });

  it("отвергает пустое и заведомо негодное", () => {
    expect(normalizeRobokassaAccount("")).toBeNull();
    expect(normalizeRobokassaAccount(null)).toBeNull();
    expect(normalizeRobokassaAccount("ab")).toBeNull();
    expect(normalizeRobokassaAccount("иванова")).toBeNull();
    expect(normalizeRobokassaAccount("a".repeat(65))).toBeNull();
  });

  it("не выдумывает более строгий формат, чем известен", () => {
    // Точного формата в контракте нет. Отвергнутый валидный аккаунт стоит
    // специалисту выплаты, поэтому проверка намеренно широкая.
    expect(normalizeRobokassaAccount("12345678")).toBe("12345678");
    expect(normalizeRobokassaAccount("Eterapy.Shop_01-A")).toBe("Eterapy.Shop_01-A");
  });
});

describe("B583 — готовность специалиста к сплиту", () => {
  const ready = { robokassaAccount: "eterapy-ivanova", taxVerified: true, practitionerActive: true };

  it("готов, когда есть аккаунт, статус и активный профиль", () => {
    expect(evaluateSplitReadiness(ready)).toEqual({ ready: true, reasons: [] });
  });

  it("без аккаунта Robokassa сплит адресовать некуда", () => {
    const result = evaluateSplitReadiness({ ...ready, robokassaAccount: null });
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("no_robokassa_account");
  });

  it("мусор в поле аккаунта считается отсутствием аккаунта", () => {
    // Иначе администратор увидел бы «готов», а сплит упал бы на исполнении.
    expect(evaluateSplitReadiness({ ...ready, robokassaAccount: "  " }).ready).toBe(false);
    expect(evaluateSplitReadiness({ ...ready, robokassaAccount: "ab" }).ready).toBe(false);
  });

  it("называет ВСЕ причины сразу, а не первую", () => {
    const result = evaluateSplitReadiness({
      robokassaAccount: null, taxVerified: false, practitionerActive: false,
    });
    expect(result.reasons).toEqual([
      "no_robokassa_account",
      "tax_not_verified",
      "practitioner_inactive",
    ]);
  });
});

describe("B583 — граница применимости холда", () => {
  const paidAt = new Date("2026-07-26T10:00:00Z");
  const plusDays = (days: number) => new Date(paidAt.getTime() + days * 86_400_000);

  it("покрывает сессию в пределах недели от оплаты", () => {
    expect(holdCoversBooking(paidAt, plusDays(0))).toBe(true);
    expect(holdCoversBooking(paidAt, plusDays(3))).toBe(true);
    expect(holdCoversBooking(paidAt, plusDays(ROBOKASSA_HOLD_MAX_DAYS))).toBe(true);
  });

  it("не покрывает бронь дальше недели — холд истечёт раньше сессии", () => {
    // Это и есть разрыв модели: такие брони обязаны идти прежним путём,
    // а не проваливаться молча.
    expect(holdCoversBooking(paidAt, plusDays(8))).toBe(false);
    expect(holdCoversBooking(paidAt, plusDays(30))).toBe(false);
  });

  it("не покрывает сессию в прошлом", () => {
    expect(holdCoversBooking(paidAt, plusDays(-1))).toBe(false);
  });
});

describe("B583 — исполнение по-прежнему падает закрыто", () => {
  it("провайдер Robokassa не имитирует успех, пока нет контракта API", () => {
    // Имитация успеха списала бы баланс специалиста без движения денег.
    expect(robokassaPayoutProvider.supportsAutoPayout({ type: "CARD", accountNumber: "1" })).toBe(false);
  });

  it("возвращает FAILED с внятной причиной, а не бросает", async () => {
    const result = await robokassaPayoutProvider.send({
      payoutId: "payout-1",
      details: { type: "CARD", accountNumber: "1" },
      amountKopecks: 100_00,
    });
    expect(result.status).toBe("FAILED");
    expect(result.status === "FAILED" && result.error).toContain("вручную");
  });
});
