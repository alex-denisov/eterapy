/**
 * B529 — приём оплаты звёздами.
 *
 * Два события с РАЗНОЙ ценой ошибки, и тесты держат именно эту разницу:
 * до `pre_checkout_query` отказ бесплатен, после `successful_payment` звёзды
 * уже списаны и «не начислить» нельзя ни при каких условиях.
 */
import { handleStarsPreCheckout, handleStarsSuccessfulPayment } from "@/lib/payments/telegram-stars-webhook";

const findUnique = jest.fn();
const update = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    transaction: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const answerPreCheckout = jest.fn();
jest.mock("@/lib/payments/telegram-stars-server", () => ({
  __esModule: true,
  answerStarsPreCheckout: (...args: unknown[]) => answerPreCheckout(...args),
}));

const creditSucceededPayment = jest.fn();
jest.mock("@/lib/billing-credit", () => ({
  __esModule: true,
  creditSucceededPayment: (...args: unknown[]) => creditSucceededPayment(...args),
}));

const claimWebhookEvent = jest.fn();
const completeWebhookEvent = jest.fn();
const failWebhookEvent = jest.fn();
jest.mock("@/lib/webhook-idempotency", () => ({
  __esModule: true,
  claimWebhookEvent: (...args: unknown[]) => claimWebhookEvent(...args),
  completeWebhookEvent: (...args: unknown[]) => completeWebhookEvent(...args),
  failWebhookEvent: (...args: unknown[]) => failWebhookEvent(...args),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  serializeError: (e: unknown) => String(e),
}));

const pendingTransaction = {
  invoiceId: 4210,
  status: "PENDING",
  currency: "XTR",
  userId: "user-1",
  metadata: { starsAmount: 494 },
};

beforeEach(() => {
  jest.clearAllMocks();
  claimWebhookEvent.mockResolvedValue({ claimed: true, event: { id: "evt-1" } });
  creditSucceededPayment.mockResolvedValue(true);
  update.mockResolvedValue({});
  // Настоящие обе — async; мок обязан возвращать промис, иначе тест проверял бы
  // не тот код.
  completeWebhookEvent.mockResolvedValue(undefined);
  failWebhookEvent.mockResolvedValue(undefined);
});

describe("B529 — pre_checkout_query", () => {
  it("подтверждает счёт, который ждёт оплаты на ту же сумму", async () => {
    findUnique.mockResolvedValue(pendingTransaction);

    const result = await handleStarsPreCheckout({
      id: "q1",
      invoice_payload: "eterapy:4210",
      total_amount: 494,
      currency: "XTR",
    });

    expect(result).toBe("precheckout:approved");
    expect(answerPreCheckout).toHaveBeenCalledWith({ queryId: "q1", ok: true });
  });

  it("отказывает по чужому payload, не трогая базу", async () => {
    const result = await handleStarsPreCheckout({ id: "q2", invoice_payload: "someone-else:1", total_amount: 494 });

    expect(result).toBe("precheckout:bad-payload");
    expect(findUnique).not.toHaveBeenCalled();
    expect(answerPreCheckout).toHaveBeenCalledWith(expect.objectContaining({ queryId: "q2", ok: false }));
  });

  it("отказывает, когда сумма не совпала со счётом", async () => {
    findUnique.mockResolvedValue(pendingTransaction);

    const result = await handleStarsPreCheckout({ id: "q3", invoice_payload: "eterapy:4210", total_amount: 1 });

    expect(result).toBe("precheckout:declined");
    expect(answerPreCheckout).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it("ВСЕГДА отвечает Telegram — молчание роняет платёж у покупателя", async () => {
    findUnique.mockResolvedValue(null);
    await handleStarsPreCheckout({ id: "q4", invoice_payload: "eterapy:999", total_amount: 494 });
    expect(answerPreCheckout).toHaveBeenCalledTimes(1);
  });
});

describe("B529 — successful_payment", () => {
  it("зачисляет через общий путь начисления, а не свой", async () => {
    const result = await handleStarsSuccessfulPayment({
      payment: { invoice_payload: "eterapy:4210", total_amount: 494, telegram_payment_charge_id: "chg_1" },
    });

    expect(result).toBe("payment:credited");
    // Тот же `creditSucceededPayment`, что у Robokassa и ЮKassa: выдача прав,
    // реферальная механика, уведомления и аудит не дублируются.
    expect(creditSucceededPayment).toHaveBeenCalledWith("eterapy:4210");
    expect(completeWebhookEvent).toHaveBeenCalledWith("evt-1", { result: "credited" });
  });

  it("сохраняет идентификатор списания — без него возврат невозможен", async () => {
    findUnique.mockResolvedValue({ metadata: { starsAmount: 494 } });

    await handleStarsSuccessfulPayment({
      payment: { invoice_payload: "eterapy:4210", total_amount: 494, telegram_payment_charge_id: "chg_1" },
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { invoiceId: 4210 },
      data: { metadata: expect.objectContaining({ telegramChargeId: "chg_1", starsAmount: 494 }) },
    }));
  });

  it("не начисляет дважды по повторной доставке", async () => {
    claimWebhookEvent.mockResolvedValue({ claimed: false, event: null });

    const result = await handleStarsSuccessfulPayment({
      payment: { invoice_payload: "eterapy:4210", total_amount: 494 },
    });

    expect(result).toBe("payment:duplicate");
    expect(creditSucceededPayment).not.toHaveBeenCalled();
  });

  it("пробрасывает сбой начисления наружу: звёзды списаны, тишина недопустима", async () => {
    creditSucceededPayment.mockRejectedValue(new Error("db down"));

    await expect(handleStarsSuccessfulPayment({
      payment: { invoice_payload: "eterapy:4210", total_amount: 494 },
    })).rejects.toThrow("db down");

    // Событие помечено неудачным — оно останется видимым, а не «обработанным».
    expect(failWebhookEvent).toHaveBeenCalledWith("evt-1", expect.any(Error));
    expect(completeWebhookEvent).not.toHaveBeenCalled();
  });

  it("не глотает оплату с нераспознанным payload", async () => {
    const result = await handleStarsSuccessfulPayment({ payment: { invoice_payload: "junk", total_amount: 494 } });
    expect(result).toBe("payment:bad-payload");
    expect(creditSucceededPayment).not.toHaveBeenCalled();
  });
});
