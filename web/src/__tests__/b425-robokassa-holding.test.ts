import { createHash } from "crypto";
import {
  buildCancelSignature,
  buildConfirmSignature,
  buildPaymentSignature,
  buildPaymentUrl,
  cancelHold,
  confirmHold,
  ROBOKASSA_CANCEL_URL,
  ROBOKASSA_CONFIRM_URL,
  type RobokassaConfig,
} from "@/lib/payments/robokassa";

/**
 * B425 — двухстадийная оплата Robokassa (владелец 2026-07-22: «двухстадийное
 * холдирование активировано»).
 *
 * Тест держит именно ПОДПИСИ: в них три места, где легко ошибиться и получить
 * молчаливый отказ провайдера, а на деньгах молчаливых отказов быть не должно.
 *
 *   1. холд: сегмент-литерал `true` встаёт ПЕРЕД паролем #1;
 *   2. подтверждение: пароль #1, а не #2, и Receipt входит только при частичном
 *      списании;
 *   3. отмена: сегмент суммы ПУСТОЙ — двоеточия идут подряд.
 */
const config: RobokassaConfig = {
  merchantLogin: "eterapy",
  password1: "pass1",
  password2: "pass2",
  hashAlgorithm: "SHA256",
  isTest: false,
};

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();

describe("B425 — подпись холда", () => {
  it("вставляет литерал true перед паролем #1", () => {
    expect(buildPaymentSignature({ config, outSum: "1500.00", invId: 42, stepByStep: true }))
      .toBe(sha256("eterapy:1500.00:42:true:pass1"));
  });

  it("без холда подпись прежняя — обычные оплаты не задеты", () => {
    expect(buildPaymentSignature({ config, outSum: "1500.00", invId: 42 }))
      .toBe(sha256("eterapy:1500.00:42:pass1"));
  });

  it("с чеком порядок сегментов: Receipt, потом true", () => {
    expect(buildPaymentSignature({ config, outSum: "1500.00", invId: 42, receiptJson: "RAW", stepByStep: true }))
      .toBe(sha256("eterapy:1500.00:42:RAW:true:pass1"));
  });

  it("ссылка на оплату несёт StepByStep=true", () => {
    const url = buildPaymentUrl({ config, amountKopecks: 150_000, invId: 42, description: "Сессия", stepByStep: true });
    expect(url).toContain("StepByStep=true");
  });

  it("обычная ссылка StepByStep не несёт вовсе", () => {
    const url = buildPaymentUrl({ config, amountKopecks: 150_000, invId: 42, description: "Сессия" });
    expect(url).not.toContain("StepByStep");
  });
});

describe("B425 — подписи подтверждения и отмены", () => {
  it("подтверждение подписывается паролем #1 без чека", () => {
    expect(buildConfirmSignature({ config, outSum: "1500.00", invId: 42 }))
      .toBe(sha256("eterapy:1500.00:42:pass1"));
  });

  it("частичное списание включает урезанный чек в подпись", () => {
    expect(buildConfirmSignature({ config, outSum: "750.00", invId: 42, receiptJson: "RAW" }))
      .toBe(sha256("eterapy:750.00:42:RAW:pass1"));
  });

  it("отмена оставляет сегмент суммы пустым", () => {
    expect(buildCancelSignature({ config, invId: 42 })).toBe(sha256("eterapy::42:pass1"));
  });
});

describe("B425 — вызовы к провайдеру", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  function mockFetch(response: Partial<Response> & { text?: () => Promise<string> }) {
    const spy = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "OK", ...response });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it("подтверждение уходит на Confirm с InvoiceID и суммой", async () => {
    const spy = mockFetch({});
    await expect(confirmHold({ config, invId: 42, amountKopecks: 150_000 })).resolves.toEqual({ ok: true });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ROBOKASSA_CONFIRM_URL);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("InvoiceID")).toBe("42");
    expect(body.get("OutSum")).toBe("1500.00");
    expect(body.get("SignatureValue")).toBe(sha256("eterapy:1500.00:42:pass1"));
    // Без частичного списания чек не шлём — состав корзины не менялся.
    expect(body.get("Receipt")).toBeNull();
  });

  it("отмена уходит на Cancel", async () => {
    const spy = mockFetch({});
    await expect(cancelHold({ config, invId: 42, amountKopecks: 150_000 })).resolves.toEqual({ ok: true });
    expect((spy.mock.calls[0] as [string, RequestInit])[0]).toBe(ROBOKASSA_CANCEL_URL);
  });

  it("HTTP-ошибка не выдаётся за успех", async () => {
    mockFetch({ ok: false, status: 500, text: async () => "boom" });
    const result = await confirmHold({ config, invId: 42, amountKopecks: 150_000 });
    expect(result.ok).toBe(false);
  });

  it("обрыв сети возвращает ошибку, а не молчаливый успех", async () => {
    // Состояние холда у провайдера неизвестно — записать деньги списанными
    // на этом ответе нельзя.
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    const result = await cancelHold({ config, invId: 42, amountKopecks: 150_000 });
    expect(result).toEqual({ ok: false, error: "ECONNRESET" });
  });

  it("ошибка в теле ответа читается как отказ", async () => {
    mockFetch({ text: async () => '{"errorCode":5,"errorMessage":"Invalid signature"}' });
    const result = await confirmHold({ config, invId: 42, amountKopecks: 150_000 });
    expect(result.ok).toBe(false);
  });
});
