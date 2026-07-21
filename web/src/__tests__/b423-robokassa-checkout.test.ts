/**
 * B423 — checkout creation on the Robokassa rail.
 *
 * The ordering guarantee under test: the local transaction row exists BEFORE a
 * payable link exists, and the link is signed with that row's `invoiceId`. If
 * this ever inverts, a customer could pay against an invoice we cannot settle.
 */
const mockDb = {
  transaction: { create: jest.fn(), update: jest.fn() },
};
jest.mock("@/lib/db", () => ({ __esModule: true, default: mockDb }));

jest.mock("@/lib/yukassa", () => ({ __esModule: true, yukassaFetch: jest.fn() }));

import { createCheckout } from "@/lib/payments/checkout";
import { activePaymentProvider, receiptTaxSystem } from "@/lib/payments/config";
import type { ResolvedBillingPurchase } from "@/lib/entitlements";

describe("B423 provider flag", () => {
  const previous = process.env.PAYMENT_PROVIDER;
  afterEach(() => {
    process.env.PAYMENT_PROVIDER = previous;
  });

  // ТРЕБОВАНИЕ ОТМЕНЕНО владельцем 2026-07-22: «отключай Юкассу навсегда»
  // (B570). Здесь стояло «stays on the incumbent unless switched explicitly» —
  // страховка на время, пока кредов Robokassa не было на сервере. Креды
  // приехали выкаткой, и осторожность превратилась в свою противоположность:
  // пустая переменная возвращала бы платежи в песочницу ЮKassa, мерчантом
  // которой ETerapy никогда не была.
  it("рельс — Robokassa при любом значении переменной", () => {
    delete process.env.PAYMENT_PROVIDER;
    expect(activePaymentProvider()).toBe("robokassa");
    process.env.PAYMENT_PROVIDER = "";
    expect(activePaymentProvider()).toBe("robokassa");
    process.env.PAYMENT_PROVIDER = "nonsense";
    expect(activePaymentProvider()).toBe("robokassa");
    process.env.PAYMENT_PROVIDER = "yookassa";
    expect(activePaymentProvider()).toBe("robokassa");
  });

  it("defaults the receipt to the УСН «доходы» tax system", () => {
    const previousSno = process.env.ROBOKASSA_TAX_SYSTEM;
    delete process.env.ROBOKASSA_TAX_SYSTEM;
    expect(receiptTaxSystem()).toBe("usn_income");
    process.env.ROBOKASSA_TAX_SYSTEM = "not-a-regime";
    expect(receiptTaxSystem()).toBe("usn_income");
    process.env.ROBOKASSA_TAX_SYSTEM = "patent";
    expect(receiptTaxSystem()).toBe("patent");
    process.env.ROBOKASSA_TAX_SYSTEM = previousSno;
  });
});

const productPurchase = {
  kind: "product",
  amountKopecks: 79000,
  description: "Разбор «Рефрейминг»",
  metadata: {
    purchaseKind: "product",
    productKey: "reframe",
    returnPath: "/products/reframe",
  },
} as unknown as ResolvedBillingPurchase;

const creditsPurchase = {
  kind: "credits",
  amountKopecks: 139000,
  description: "Пакет 10 разборов",
  metadata: {
    purchaseKind: "credits",
    creditPackKey: "pack-10",
    creditsAmount: 10,
    returnPath: "/cabinet/billing",
  },
} as unknown as ResolvedBillingPurchase;

describe("B423 Robokassa checkout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PAYMENT_PROVIDER = "robokassa";
    process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
    process.env.ROBOKASSA_PASSWORD_1 = "P1";
    process.env.ROBOKASSA_PASSWORD_2 = "P2";
    process.env.ROBOKASSA_HASH_ALGORITHM = "SHA256";
    delete process.env.ROBOKASSA_IS_TEST;

    mockDb.transaction.create.mockResolvedValue({ id: "tx-1", invoiceId: 4242 });
    mockDb.transaction.update.mockResolvedValue({});
  });

  it("records the transaction before handing out a payable link", async () => {
    const checkout = await createCheckout({
      userId: "user-1",
      userEmail: "client@test.eterapy.com",
      purchase: productPurchase,
    });

    expect(mockDb.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          amount: 79000,
          currency: "RUB",
          status: "PENDING",
          provider: "robokassa",
        }),
      }),
    );
    expect(checkout.transactionId).toBe("tx-1");
    expect(checkout.confirmationUrl).toContain("auth.robokassa.ru");
  });

  it("uses the row's invoiceId as both InvId and providerPaymentId", async () => {
    const checkout = await createCheckout({ userId: "user-1", purchase: productPurchase });

    expect(checkout.providerPaymentId).toBe("4242");
    expect(mockDb.transaction.update).toHaveBeenCalledWith({
      where: { id: "tx-1" },
      data: { providerPaymentId: "4242" },
    });
    expect(new URL(checkout.confirmationUrl).searchParams.get("InvId")).toBe("4242");
  });

  it("attaches a 54-ФЗ receipt without VAT for a УСН merchant", async () => {
    const checkout = await createCheckout({ userId: "user-1", purchase: productPurchase });

    const receiptRaw = checkout.confirmationUrl.slice(
      checkout.confirmationUrl.indexOf("&Receipt=") + "&Receipt=".length,
    );
    const receipt = JSON.parse(decodeURIComponent(receiptRaw));
    expect(receipt.sno).toBe("usn_income");
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0]).toMatchObject({
      name: "Разбор «Рефрейминг»",
      sum: 790,
      tax: "none",
      payment_object: "service",
      payment_method: "full_payment",
    });
  });

  it("bills a credit pack as an advance, not as a delivered service", async () => {
    const checkout = await createCheckout({ userId: "user-1", purchase: creditsPurchase });

    const receiptRaw = checkout.confirmationUrl.slice(
      checkout.confirmationUrl.indexOf("&Receipt=") + "&Receipt=".length,
    );
    const receipt = JSON.parse(decodeURIComponent(receiptRaw));
    expect(receipt.items[0]).toMatchObject({
      payment_object: "payment",
      payment_method: "advance",
    });
  });

  it("expires the payment link so an abandoned checkout cannot be paid later", async () => {
    const checkout = await createCheckout({ userId: "user-1", purchase: productPurchase });

    const expiration = new URL(checkout.confirmationUrl).searchParams.get("ExpirationDate");
    expect(expiration).toBeTruthy();
    // Without an explicit offset Robokassa reads the value as Moscow time and
    // the link is already expired when it is handed out.
    expect(expiration).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(new Date(expiration!).getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to create a payment when credentials are missing", async () => {
    delete process.env.ROBOKASSA_PASSWORD_1;

    await expect(createCheckout({ userId: "user-1", purchase: productPurchase })).rejects.toThrow(
      /ROBOKASSA_PASSWORD_1/,
    );
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
  });
});
