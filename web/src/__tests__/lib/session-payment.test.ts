/**
 * Z1a — session-payment orchestration (hold / capture / cancel / refund).
 * db + yukassa are mocked; we assert the booking/payment state transitions and
 * that the right YooKassa two-stage call is made.
 */
jest.mock("@/lib/env", () => ({ APP_URL: "https://app.test", YUKASSA_API_URL: "https://api.test" }));

const yk = {
  createTwoStagePayment: jest.fn(),
  createTwoStagePaymentFromSavedMethod: jest.fn(),
  capturePayment: jest.fn(),
  cancelPayment: jest.fn(),
  createRefund: jest.fn(),
};
jest.mock("@/lib/yukassa", () => ({ __esModule: true, ...yk }));

const mockDb = {
  booking: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  payment: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  savedCard: { findFirst: jest.fn() },
  transaction: { create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("@/lib/db", () => ({ __esModule: true, default: mockDb }));

const mockNotify = jest.fn();
jest.mock("@/lib/notifications", () => ({ __esModule: true, notify: (...a: unknown[]) => mockNotify(...a) }));

import {
  holdSessionForBooking,
  captureSessionForBooking,
  cancelSessionHold,
  refundSessionForBooking,
} from "@/lib/session-payment";

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockDb));
  // Mutating ops resolve by default so `.catch()` chains don't throw.
  mockDb.booking.update.mockResolvedValue({});
  mockDb.booking.updateMany.mockResolvedValue({ count: 1 });
  mockDb.payment.upsert.mockResolvedValue({});
  mockDb.payment.update.mockResolvedValue({});
  mockDb.transaction.create.mockResolvedValue({});
});

describe("Z1a holdSessionForBooking", () => {
  it("no-ops for a free session (priceRub=0)", async () => {
    const res = await holdSessionForBooking({ bookingId: "b1", priceRub: 0 });
    expect(res).toEqual({ status: "free" });
    expect(yk.createTwoStagePayment).not.toHaveBeenCalled();
  });

  it("creates a two-stage hold and records the payment (no saved card → redirect)", async () => {
    mockDb.savedCard.findFirst.mockResolvedValueOnce(null);
    yk.createTwoStagePayment.mockResolvedValueOnce({ id: "pay-1", status: "waiting_for_capture", confirmationUrl: "https://yk/confirm" });
    const res = await holdSessionForBooking({ bookingId: "b1", priceRub: 9500, clientId: "u1" });
    expect(yk.createTwoStagePayment).toHaveBeenCalledWith(expect.objectContaining({ amountKopecks: 950_000, bookingId: "b1" }));
    expect(mockDb.booking.update).toHaveBeenCalledWith(expect.objectContaining({ data: { paymentId: "pay-1", paymentMethod: "yukassa" } }));
    expect(mockDb.payment.upsert).toHaveBeenCalled();
    expect(res).toEqual({ status: "held", paymentId: "pay-1", confirmationUrl: "https://yk/confirm", viaSavedCard: false });
  });

  it("Баг 16: holds one-tap on a saved card without a confirmation redirect", async () => {
    mockDb.savedCard.findFirst.mockResolvedValueOnce({ paymentMethodId: "pm-9" });
    yk.createTwoStagePaymentFromSavedMethod.mockResolvedValueOnce({ id: "pay-2", status: "waiting_for_capture", confirmationUrl: null });
    const res = await holdSessionForBooking({ bookingId: "b2", priceRub: 2000, clientId: "u1" });
    expect(yk.createTwoStagePaymentFromSavedMethod).toHaveBeenCalledWith(expect.objectContaining({ paymentMethodId: "pm-9", customerId: "u1", bookingId: "b2" }));
    expect(yk.createTwoStagePayment).not.toHaveBeenCalled();
    expect(res).toEqual({ status: "held", paymentId: "pay-2", confirmationUrl: "", viaSavedCard: true });
  });

  it("falls back to a redirect hold when the saved-card payment needs 3DS", async () => {
    mockDb.savedCard.findFirst.mockResolvedValueOnce({ paymentMethodId: "pm-9" });
    yk.createTwoStagePaymentFromSavedMethod.mockResolvedValueOnce({ id: "pay-3", status: "pending", confirmationUrl: "https://yk/3ds" });
    const res = await holdSessionForBooking({ bookingId: "b3", priceRub: 2000, clientId: "u1" });
    expect(res).toEqual({ status: "held", paymentId: "pay-3", confirmationUrl: "https://yk/3ds", viaSavedCard: false });
  });
});

describe("Z1a captureSessionForBooking", () => {
  it("captures the hold on CONFIRMED→IN_PROGRESS", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({ id: "b1", clientId: "u1", priceRub: 9500, status: "CONFIRMED", paymentId: "pay-1" });
    yk.capturePayment.mockResolvedValueOnce({ id: "pay-1", status: "succeeded" });
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await captureSessionForBooking("b1");

    expect(yk.capturePayment).toHaveBeenCalledWith("pay-1", 950_000);
    expect(mockDb.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "PAID" } }));
    expect(mockDb.transaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: -950_000, provider: "yukassa" }) }));
    expect(res).toEqual({ status: "charged", priceKopecks: 950_000 });
  });

  it("returns already_charged when already IN_PROGRESS", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({ id: "b1", clientId: "u1", priceRub: 9500, status: "IN_PROGRESS", paymentId: "pay-1" });
    expect(await captureSessionForBooking("b1")).toEqual({ status: "already_charged" });
    expect(yk.capturePayment).not.toHaveBeenCalled();
  });

  it("returns hold_missing when no paymentId on a paid session", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({ id: "b1", clientId: "u1", priceRub: 9500, status: "CONFIRMED", paymentId: null });
    expect(await captureSessionForBooking("b1")).toEqual({ status: "hold_missing" });
  });

  it("free session flips status without charging", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({ id: "b1", clientId: "u1", priceRub: 0, status: "CONFIRMED", paymentId: null });
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await captureSessionForBooking("b1")).toEqual({ status: "charged", priceKopecks: 0 });
    expect(yk.capturePayment).not.toHaveBeenCalled();
  });
});

describe("Z1a cancelSessionHold", () => {
  it("cancels a held (PENDING) payment", async () => {
    mockDb.payment.findUnique.mockResolvedValueOnce({ externalId: "pay-1", status: "PENDING" });
    yk.cancelPayment.mockResolvedValueOnce({ id: "pay-1", status: "canceled" });
    expect(await cancelSessionHold("b1")).toEqual({ status: "cancelled" });
    expect(yk.cancelPayment).toHaveBeenCalledWith("pay-1");
  });

  it("does not cancel an already-captured (PAID) payment", async () => {
    mockDb.payment.findUnique.mockResolvedValueOnce({ externalId: "pay-1", status: "PAID" });
    expect(await cancelSessionHold("b1")).toEqual({ status: "already_captured" });
    expect(yk.cancelPayment).not.toHaveBeenCalled();
  });

  it("no-ops when there is no payment", async () => {
    mockDb.payment.findUnique.mockResolvedValueOnce(null);
    expect(await cancelSessionHold("b1")).toEqual({ status: "noop" });
  });
});

describe("Z1a refundSessionForBooking", () => {
  it("refunds a captured (PAID) payment to the card", async () => {
    mockDb.payment.findUnique.mockResolvedValueOnce({ externalId: "pay-1", status: "PAID" });
    yk.createRefund.mockResolvedValueOnce({ id: "ref-1", status: "succeeded" });
    expect(await refundSessionForBooking("b1", 950_000)).toEqual({ status: "refunded" });
    expect(yk.createRefund).toHaveBeenCalledWith({ paymentId: "pay-1", amountKopecks: 950_000 });
  });

  it("no-ops when the payment was never captured", async () => {
    mockDb.payment.findUnique.mockResolvedValueOnce({ externalId: "pay-1", status: "PENDING" });
    expect(await refundSessionForBooking("b1", 950_000)).toEqual({ status: "noop" });
    expect(yk.createRefund).not.toHaveBeenCalled();
  });
});
