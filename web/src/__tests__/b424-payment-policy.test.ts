import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { currentLegalDocumentVersionSnapshot } from "@/lib/legal-documents";

const docVersions = currentLegalDocumentVersionSnapshot();

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

const mockDb = {
  transaction: {
    count: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  savedCard: {
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  productEntitlement: { findFirst: jest.fn(), create: jest.fn() },
  userSubscription: { create: jest.fn() },
  creditLedgerEntry: { create: jest.fn() },
  clarityCreditLedgerEntry: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  $executeRaw: jest.fn(),
  $transaction: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: mockDb,
}));

const yk = {
  yukassaFetch: jest.fn(),
  createRefund: jest.fn(),
  cancelPayment: jest.fn(),
};
jest.mock("@/lib/yukassa", () => ({
  __esModule: true,
  ...yk,
}));

jest.mock("@/lib/notifications", () => ({
  __esModule: true,
  notify: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/analytics", () => ({
  __esModule: true,
  trackServerEvent: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  __esModule: true,
  AUDIT_ACTIONS: { PAYMENT: "PAYMENT", CARD_LINKED: "CARD_LINKED" },
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  serializeError: jest.fn((err) => ({ message: err instanceof Error ? err.message : String(err) })),
}));

import { auth } from "@/lib/auth";
import { POST as createPayment } from "@/app/api/billing/create-payment/route";
import { applyPaymentResult } from "@/lib/billing-credit";
import {
  RU_ONLY_PAYMENT_DECLINE_MESSAGE,
  assertRubPaymentAmount,
  normalizePaymentDeclineReason,
  sanitizePaymentProviderPayload,
} from "@/lib/billing-policy";

const mockAuth = auth as jest.MockedFunction<typeof auth>;

function request(body: unknown) {
  return new Request("https://app.eterapy.com/api/billing/create-payment", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "b424-test" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("B424 payment policy", () => {
  // B570: рельс один — Robokassa, и ей нужны креды, иначе checkout бросит.
  // Пароли здесь БОЕВЫЕ по смыслу теста: почта пользователя не входит в
  // ROBOKASSA_TEST_EMAILS, значит подписывать должно боевой парой.
  const previousProvider = process.env.PAYMENT_PROVIDER;
  const previousRobokassa = {
    login: process.env.ROBOKASSA_MERCHANT_LOGIN,
    p1: process.env.ROBOKASSA_PASSWORD_1,
    p2: process.env.ROBOKASSA_PASSWORD_2,
    testEmails: process.env.ROBOKASSA_TEST_EMAILS,
  };
  beforeAll(() => {
    process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
    process.env.ROBOKASSA_PASSWORD_1 = "p1";
    process.env.ROBOKASSA_PASSWORD_2 = "p2";
    delete process.env.ROBOKASSA_TEST_EMAILS;
    delete process.env.ROBOKASSA_IS_TEST;
  });
  afterAll(() => {
    process.env.ROBOKASSA_MERCHANT_LOGIN = previousRobokassa.login;
    process.env.ROBOKASSA_PASSWORD_1 = previousRobokassa.p1;
    process.env.ROBOKASSA_PASSWORD_2 = previousRobokassa.p2;
    process.env.ROBOKASSA_TEST_EMAILS = previousRobokassa.testEmails;
  });
  afterAll(() => {
    process.env.PAYMENT_PROVIDER = previousProvider;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "CLIENT" },
      expires: "2026-06-18T00:00:00.000Z",
    } as never);
    mockDb.transaction.count.mockResolvedValue(0);
    mockDb.transaction.create.mockResolvedValue({ id: "tx-1" });
    mockDb.transaction.update.mockResolvedValue({});
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockDb));
  });

  // B570: рельс переведён на Robokassa целиком, ветки ЮKassa в checkout больше
  // нет. Сама политика (рубли + версии документов на транзакции) никуда не
  // делась, поэтому проверки переехали на живой путь, а не удалены.
  it("binds checkout transactions to document versions and RUB-only provider metadata", async () => {
    mockDb.transaction.create.mockResolvedValueOnce({ id: "tx-1", invoiceId: 4242 });

    const response = await createPayment(request({ productKey: "reframe", checkoutSource: "test" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.confirmationUrl).toContain("robokassa");
    expect(mockDb.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        currency: "RUB",
        provider: "robokassa",
        offerVersion: docVersions.offerVersion,
        termsVersion: docVersions.termsVersion,
        consentVersion: docVersions.consentVersion,
        metadata: expect.objectContaining({
          ruOnlyPaymentPolicy: true,
          currency: "RUB",
        }),
      }),
    }));
  });

  // На пути Robokassa валидировать «ответ провайдера» нечего: ссылка на оплату
  // собирается нами, сумма уходит в рублях по построению. Гарантия стала
  // структурной, но сам страж остаётся живым кодом — его вызывает сверка, — и
  // проверяется здесь напрямую.
  it("rejects non-RUB amounts at the policy guard", () => {
    expect(() => assertRubPaymentAmount({ amount: { value: "3.00", currency: "USD" } })).toThrow(
      /Unsupported payment currency: USD/,
    );
    expect(() => assertRubPaymentAmount({ amount: { value: "299.00", currency: "RUB" } })).not.toThrow();
  });

  it("normalizes foreign-card cancellation and stores a durable decline reason", async () => {
    mockDb.transaction.findUnique.mockResolvedValueOnce({
      id: "tx-cancel",
      userId: "user-1",
      status: "PENDING",
      providerPaymentId: "pay-cancel",
      metadata: { purchaseKind: "product", productKey: "reframe" },
    });

    const payment = {
      id: "pay-cancel",
      status: "canceled",
      paid: false,
      amount: { value: "299.00", currency: "RUB" },
      cancellation_details: { party: "payment_network", reason: "payment_method_restricted" },
      payment_method: {
        id: "pm-foreign",
        card: { issuer_country: "KZ" },
      },
    };

    expect(normalizePaymentDeclineReason(payment)).toBe("ru_payment_method_required");
    await expect(applyPaymentResult(payment as never)).resolves.toBe("cancelled");

    expect(mockDb.transaction.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "tx-cancel" },
      data: expect.objectContaining({
        status: "CANCELLED",
        paymentDeclineReason: "ru_payment_method_required",
        metadata: expect.objectContaining({
          paymentDeclineReason: "ru_payment_method_required",
        }),
      }),
    }));
  });

  it("sanitizes provider webhook payloads before durable storage", () => {
    const sanitized = sanitizePaymentProviderPayload({
      object: {
        payment_method: {
          card: {
            first6: "411111",
            last4: "1111",
            expiry_month: "12",
            expiry_year: "2030",
            issuer_name: "Example Bank",
          },
        },
      },
    }) as { object: { payment_method: { card: Record<string, unknown> } } };

    expect(sanitized.object.payment_method.card.first6).toBe("[redacted]");
    expect(sanitized.object.payment_method.card.expiry_month).toBe("[redacted]");
    expect(sanitized.object.payment_method.card.expiry_year).toBe("[redacted]");
    expect(sanitized.object.payment_method.card.issuer_name).toBe("[redacted]");
    expect(sanitized.object.payment_method.card.last4).toBe("1111");
  });

  it("does not persist PAN/CVV in billing routes or payment schema", () => {
    const files = [
      "src/app/api/billing/create-payment/route.ts",
      "src/app/api/billing/pay-with-saved-card/route.ts",
      "src/app/api/billing/save-card/route.ts",
      "src/app/api/billing/yookassa-webhook/route.ts",
      "src/lib/billing-credit.ts",
      "prisma/schema.prisma",
    ];
    const joined = files
      .map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8"))
      .join("\n")
      .toLowerCase();

    expect(joined).not.toMatch(/\b(cvv|cvc|pan|cardnumber|card_number)\b/);
    expect(joined).toContain("paymentmethodid");
  });

  it("uses the legal-approved RU-only decline copy", () => {
    expect(RU_ONLY_PAYMENT_DECLINE_MESSAGE).toBe(
      "Оплата временно доступна только российскими платёжными средствами. Попробуйте карту российского банка или другой способ оплаты.",
    );
  });
});
