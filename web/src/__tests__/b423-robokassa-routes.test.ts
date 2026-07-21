/**
 * B423 — Robokassa ResultURL / SuccessURL behaviour.
 *
 * ResultURL is the only endpoint that grants anything, so its refusals matter
 * more than its happy path: a wrong signature, an unknown invoice or an amount
 * that disagrees with our record must never credit a user.
 */
import type { NextRequest } from "next/server";

const mockDb = {
  transaction: { findUnique: jest.fn() },
};
jest.mock("@/lib/db", () => ({ __esModule: true, default: mockDb }));

const billingCredit = { creditSucceededPayment: jest.fn() };
jest.mock("@/lib/billing-credit", () => ({ __esModule: true, ...billingCredit }));

const idempotency = {
  claimWebhookEvent: jest.fn(),
  completeWebhookEvent: jest.fn(),
  failWebhookEvent: jest.fn(),
};
jest.mock("@/lib/webhook-idempotency", () => ({ __esModule: true, ...idempotency }));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  serializeError: jest.fn((err) => ({ message: err instanceof Error ? err.message : String(err) })),
}));

import { POST as robokassaResult } from "@/app/api/billing/robokassa-result/route";
import { GET as robokassaSuccess } from "@/app/api/billing/robokassa-success/route";

// openssl: printf '790.00:1001:P2' | openssl dgst -sha256
const RESULT_SIGNATURE = "761A72042C89B50FAF7C15F79021A53C3437B72FC0BBEA2E48934E583F6CFEDD";
// openssl: printf '790.00:1001:P1' | openssl dgst -sha256
const SUCCESS_SIGNATURE = "6A834276271FF52C464B8C667B1232698F01920261E0DC0CBB87CA8DDAB37BC9";

function resultRequest(params: Record<string, string>) {
  return new Request("https://eterapy.com/api/billing/robokassa-result", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  }) as NextRequest;
}

function successRequest(params: Record<string, string>) {
  const url = new URL("https://eterapy.com/api/billing/robokassa-success");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const req = new Request(url, { method: "GET" }) as NextRequest;
  // Next populates nextUrl; in unit tests we stand it in explicitly.
  Object.defineProperty(req, "nextUrl", { value: url, configurable: true });
  return req;
}

const PENDING_TRANSACTION = {
  id: "tx-1",
  userId: "user-1",
  amount: 79000,
  status: "PENDING",
  invoiceId: 1001,
  metadata: { returnPath: "/products/reframe", productKey: "reframe" },
};

describe("B423 Robokassa ResultURL", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
    process.env.ROBOKASSA_PASSWORD_1 = "P1";
    process.env.ROBOKASSA_PASSWORD_2 = "P2";
    process.env.ROBOKASSA_HASH_ALGORITHM = "SHA256";
    delete process.env.ROBOKASSA_IS_TEST;

    mockDb.transaction.findUnique.mockResolvedValue(PENDING_TRANSACTION);
    idempotency.claimWebhookEvent.mockResolvedValue({ claimed: true, event: { id: "evt-1" } });
    idempotency.completeWebhookEvent.mockResolvedValue(undefined);
    billingCredit.creditSucceededPayment.mockResolvedValue(true);
  });

  it("credits the payment and answers OK{InvId}", async () => {
    const response = await robokassaResult(
      resultRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: RESULT_SIGNATURE }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK1001");
    expect(billingCredit.creditSucceededPayment).toHaveBeenCalledWith("1001");
  });

  it("refuses a callback signed with password #1 instead of #2", async () => {
    const response = await robokassaResult(
      resultRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: SUCCESS_SIGNATURE }),
    );

    expect(response.status).toBe(403);
    expect(billingCredit.creditSucceededPayment).not.toHaveBeenCalled();
  });

  it("refuses a callback with no signature at all", async () => {
    const response = await robokassaResult(resultRequest({ OutSum: "790.00", InvId: "1001" }));

    expect(response.status).toBe(400);
    expect(billingCredit.creditSucceededPayment).not.toHaveBeenCalled();
  });

  it("refuses an invoice we have no record of", async () => {
    mockDb.transaction.findUnique.mockResolvedValue(null);

    const response = await robokassaResult(
      resultRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: RESULT_SIGNATURE }),
    );

    expect(response.status).toBe(404);
    expect(billingCredit.creditSucceededPayment).not.toHaveBeenCalled();
  });

  it("refuses when the paid amount disagrees with our record", async () => {
    mockDb.transaction.findUnique.mockResolvedValue({ ...PENDING_TRANSACTION, amount: 139000 });

    const response = await robokassaResult(
      resultRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: RESULT_SIGNATURE }),
    );

    expect(response.status).toBe(409);
    expect(billingCredit.creditSucceededPayment).not.toHaveBeenCalled();
  });

  it("acknowledges a duplicate callback without crediting twice", async () => {
    idempotency.claimWebhookEvent.mockResolvedValue({ claimed: false });

    const response = await robokassaResult(
      resultRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: RESULT_SIGNATURE }),
    );

    // Robokassa retries until it sees OK{InvId}, so a duplicate must still ack.
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK1001");
    expect(billingCredit.creditSucceededPayment).not.toHaveBeenCalled();
  });

  it("withholds the acknowledgement when crediting throws, so Robokassa retries", async () => {
    billingCredit.creditSucceededPayment.mockRejectedValue(new Error("db down"));
    idempotency.failWebhookEvent.mockResolvedValue(undefined);

    const response = await robokassaResult(
      resultRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: RESULT_SIGNATURE }),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("OK");
    expect(idempotency.failWebhookEvent).toHaveBeenCalled();
  });

  it("does not credit when credentials are missing", async () => {
    delete process.env.ROBOKASSA_PASSWORD_2;

    const response = await robokassaResult(
      resultRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: RESULT_SIGNATURE }),
    );

    expect(response.status).toBe(500);
    expect(billingCredit.creditSucceededPayment).not.toHaveBeenCalled();
  });

  it("uses the test passwords in test mode", async () => {
    process.env.ROBOKASSA_IS_TEST = "1";
    process.env.ROBOKASSA_TEST_PASSWORD_1 = "TP1";
    process.env.ROBOKASSA_TEST_PASSWORD_2 = "P2";

    const response = await robokassaResult(
      resultRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: RESULT_SIGNATURE }),
    );

    // Signature above was made with "P2", configured here as the TEST password.
    expect(response.status).toBe(200);
    expect(billingCredit.creditSucceededPayment).toHaveBeenCalled();
  });
});

describe("B423 Robokassa SuccessURL", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ROBOKASSA_MERCHANT_LOGIN = "eterapy";
    process.env.ROBOKASSA_PASSWORD_1 = "P1";
    process.env.ROBOKASSA_PASSWORD_2 = "P2";
    process.env.ROBOKASSA_HASH_ALGORITHM = "SHA256";
    delete process.env.ROBOKASSA_IS_TEST;
    mockDb.transaction.findUnique.mockResolvedValue(PENDING_TRANSACTION);
  });

  it("returns the payer to the surface the purchase started from", async () => {
    const response = await robokassaSuccess(
      successRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: SUCCESS_SIGNATURE }),
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/products/reframe");
    expect(location.searchParams.get("payment")).toBe("success");
    expect(location.searchParams.get("productKey")).toBe("reframe");
  });

  it("never grants anything — crediting belongs to ResultURL alone", async () => {
    await robokassaSuccess(
      successRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: SUCCESS_SIGNATURE }),
    );

    expect(billingCredit.creditSucceededPayment).not.toHaveBeenCalled();
  });

  it("sends a forged redirect to the failure screen", async () => {
    const response = await robokassaSuccess(
      successRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: "0".repeat(64) }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("payment=fail");
  });

  it("ignores an attacker-supplied off-site returnPath", async () => {
    mockDb.transaction.findUnique.mockResolvedValue({
      ...PENDING_TRANSACTION,
      metadata: { returnPath: "//evil.example/steal" },
    });

    const response = await robokassaSuccess(
      successRequest({ OutSum: "790.00", InvId: "1001", SignatureValue: SUCCESS_SIGNATURE }),
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.hostname).not.toBe("evil.example");
    expect(location.pathname).toBe("/cabinet/billing");
  });
});
