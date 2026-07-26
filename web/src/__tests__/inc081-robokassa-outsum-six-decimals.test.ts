/**
 * INC-081 — деньги списаны, товар не выдан.
 *
 * 2026-07-27 00:03 MSK владелец оплатил «Переосмысление» (299 ₽, InvId 70).
 * Robokassa провела платёж (OpStateExt: State.Code = 100, RRN 620892908812),
 * четыре раза вызвала ResultURL — и все четыре раза получила HTTP 400
 * «bad request». Транзакция осталась PENDING, доступ не открылся.
 *
 * Причина: SuccessURL (браузерный редирект) присылает `OutSum=299.00`, а
 * серверный ResultURL — `OutSum=299.000000`. Разбор суммы принимал не больше
 * ДВУХ знаков после точки, отвергал шестизначную форму, и `parseCallback`
 * возвращал null ещё до проверки подписи.
 *
 * Это отвергало КАЖДЫЙ боевой платёж: за всё время на проде не было ни одной
 * успешной транзакции — не потому, что никто не платил, а потому что
 * единственная оплата не смогла быть зачислена.
 */
import { parseCallback, parseOutSumToKopecks } from "@/lib/payments/robokassa";

describe("INC-081: OutSum с шестью знаками после точки", () => {
  it("разбирает форму ResultURL (6 знаков) так же, как форму SuccessURL (2 знака)", () => {
    expect(parseOutSumToKopecks("299.000000")).toBe(29900);
    expect(parseOutSumToKopecks("299.00")).toBe(29900);
    expect(parseOutSumToKopecks("299")).toBe(29900);
  });

  it("не теряет копейки в длинной форме", () => {
    expect(parseOutSumToKopecks("1390.500000")).toBe(139050);
    expect(parseOutSumToKopecks("0.010000")).toBe(1);
  });

  it("отвергает суммы мельче копейки, а не округляет их молча", () => {
    // Округление здесь означало бы расхождение с тем, что реально списал банк.
    expect(parseOutSumToKopecks("299.001000")).toBeNull();
    expect(parseOutSumToKopecks("0.005")).toBeNull();
  });

  it("по-прежнему отвергает мусор", () => {
    expect(parseOutSumToKopecks("")).toBeNull();
    expect(parseOutSumToKopecks("abc")).toBeNull();
    expect(parseOutSumToKopecks("-5.00")).toBeNull();
    expect(parseOutSumToKopecks("299.0000000")).toBeNull(); // 7 знаков — не наш формат
  });

  it("parseCallback принимает боевой колбэк ResultURL целиком", () => {
    const params = new URLSearchParams({
      OutSum: "299.000000",
      InvId: "70",
      SignatureValue: "ABC123",
      Fee: "8.97",
      PaymentMethod: "BankCard",
    });
    const callback = parseCallback(params);
    expect(callback).not.toBeNull();
    expect(callback?.invId).toBe(70);
    // Подпись Robokassa строится по ТОЙ ЖЕ строке, что пришла на провод —
    // нормализованная форма для сверки суммы, сырая для проверки подписи.
    expect(callback?.outSum).toBe("299.000000");
  });
});
