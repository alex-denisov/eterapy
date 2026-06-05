/**
 * Z1-Ф1 — card binding via a 1₽ two-stage hold that is released (not charged).
 * `verifyCardHold` saves the card and cancels the hold; `applyPaymentResult`
 * routes `waiting_for_capture` save-method payments to it (and ignores session holds).
 */
jest.mock("@/lib/notifications", () => ({ __esModule: true, notify: jest.fn().mockResolvedValue(undefined) }));

const yk = { createRefund: jest.fn(), cancelPayment: jest.fn().mockResolvedValue({ status: "canceled" }) };
jest.mock("@/lib/yukassa", () => ({ __esModule: true, ...yk }));

const mockDb = {
  transaction: { findUnique: jest.fn(), update: jest.fn() },
  savedCard: { findUnique: jest.fn(), count: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("@/lib/db", () => ({ __esModule: true, default: mockDb }));

import { verifyCardHold, applyPaymentResult } from "@/lib/billing-credit";

const savedMethod = {
  id: "pm-1",
  saved: true,
  card: { last4: "4444", card_type: "MasterCard", expiry_month: "12", expiry_year: "2030" },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockDb));
  mockDb.transaction.update.mockResolvedValue({});
  mockDb.savedCard.findUnique.mockResolvedValue(null);
  mockDb.savedCard.count.mockResolvedValue(0);
  mockDb.savedCard.create.mockResolvedValue({});
  yk.cancelPayment.mockResolvedValue({ status: "canceled" });
});

describe("verifyCardHold", () => {
  it("saves the card, marks the txn CANCELLED, and releases the 1₽ hold", async () => {
    mockDb.transaction.findUnique.mockResolvedValueOnce({ id: "t1", userId: "u1", status: "PENDING", providerPaymentId: "pay-1" });

    const ok = await verifyCardHold("pay-1", savedMethod);

    expect(ok).toBe(true);
    expect(mockDb.savedCard.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "u1", paymentMethodId: "pm-1", last4: "4444", brand: "MasterCard", isDefault: true }),
    }));
    expect(mockDb.transaction.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "CANCELLED" } });
    expect(yk.cancelPayment).toHaveBeenCalledWith("pay-1"); // hold released, never captured
  });

  it("is idempotent — does nothing if the txn is not PENDING", async () => {
    mockDb.transaction.findUnique.mockResolvedValueOnce({ id: "t1", userId: "u1", status: "CANCELLED", providerPaymentId: "pay-1" });
    expect(await verifyCardHold("pay-1", savedMethod)).toBe(false);
    expect(yk.cancelPayment).not.toHaveBeenCalled();
    expect(mockDb.savedCard.create).not.toHaveBeenCalled();
  });

  it("does not duplicate an already-saved card", async () => {
    mockDb.transaction.findUnique.mockResolvedValueOnce({ id: "t1", userId: "u1", status: "PENDING", providerPaymentId: "pay-1" });
    mockDb.savedCard.findUnique.mockResolvedValueOnce({ id: "sc1" });
    expect(await verifyCardHold("pay-1", savedMethod)).toBe(true);
    expect(mockDb.savedCard.create).not.toHaveBeenCalled();
    expect(yk.cancelPayment).toHaveBeenCalledWith("pay-1");
  });
});

describe("applyPaymentResult routing for waiting_for_capture", () => {
  it("routes a saved-method hold to card verification", async () => {
    mockDb.transaction.findUnique.mockResolvedValueOnce({ id: "t1", userId: "u1", status: "PENDING", providerPaymentId: "pay-1" });
    const res = await applyPaymentResult({ id: "pay-1", status: "waiting_for_capture", payment_method: savedMethod });
    expect(res).toBe("card_verified");
    expect(yk.cancelPayment).toHaveBeenCalledWith("pay-1");
  });

  it("ignores a session hold (no saved method) — captured server-side later", async () => {
    const res = await applyPaymentResult({ id: "pay-2", status: "waiting_for_capture", payment_method: { id: "pm-x", saved: false } });
    expect(res).toBe("noop");
    expect(yk.cancelPayment).not.toHaveBeenCalled();
  });
});
