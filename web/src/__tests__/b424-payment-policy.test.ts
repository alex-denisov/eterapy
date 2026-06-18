import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

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

  it("binds checkout transactions to document versions and RUB-only provider metadata", async () => {
    yk.yukassaFetch.mockResolvedValueOnce({
      id: "pay-1",
      status: "pending",
      paid: false,
      amount: { value: "299.00", currency: "RUB" },
      confirmation: { confirmation_url: "https://yookassa.example/pay-1" },
    });

    const response = await createPayment(request({ productKey: "perspectives", checkoutSource: "test" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.confirmationUrl).toBe("https://yookassa.example/pay-1");
    expect(yk.yukassaFetch).toHaveBeenCalledWith("/payments", expect.objectContaining({
      body: expect.objectContaining({
        amount: { value: "299.00", currency: "RUB" },
        metadata: expect.objectContaining({
          currency: "RUB",
          ruOnlyPaymentPolicy: "true",
          offerVersion: "offer-2026-05-16",
          termsVersion: "offer-2026-05-16",
          consentVersion: "payment-consent-2026-06-18",
        }),
      }),
    }));
    expect(mockDb.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        currency: "RUB",
        offerVersion: "offer-2026-05-16",
        termsVersion: "offer-2026-05-16",
        consentVersion: "payment-consent-2026-06-18",
        metadata: expect.objectContaining({
          ruOnlyPaymentPolicy: true,
          currency: "RUB",
        }),
      }),
    }));
  });

  it("rejects non-RUB provider responses before persisting a transaction", async () => {
    yk.yukassaFetch.mockResolvedValueOnce({
      id: "pay-usd",
      status: "pending",
      paid: false,
      amount: { value: "3.00", currency: "USD" },
      confirmation: { confirmation_url: "https://yookassa.example/pay-usd" },
    });

    const response = await createPayment(request({ productKey: "perspectives" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Оплата доступна только в рублях.");
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
  });

  it("normalizes foreign-card cancellation and stores a durable decline reason", async () => {
    mockDb.transaction.findUnique.mockResolvedValueOnce({
      id: "tx-cancel",
      userId: "user-1",
      status: "PENDING",
      providerPaymentId: "pay-cancel",
      metadata: { purchaseKind: "product", productKey: "perspectives" },
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
