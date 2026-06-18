jest.mock("@/lib/yukassa", () => ({
  __esModule: true,
  capturePayment: jest.fn(),
  createRefund: jest.fn(),
  createTwoStagePayment: jest.fn(),
  createTwoStagePaymentFromSavedMethod: jest.fn(),
  cancelPayment: jest.fn(),
}));

jest.mock("@/lib/notifications", () => ({
  __esModule: true,
  notify: jest.fn().mockResolvedValue(undefined),
}));

const mockDb = {
  booking: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  payment: { findUnique: jest.fn(), update: jest.fn() },
  payout: { create: jest.fn(), updateMany: jest.fn() },
  practitioner: { update: jest.fn() },
  transaction: { create: jest.fn() },
  userSubscription: { findMany: jest.fn() },
  savedCard: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: mockDb,
}));

import { capturePayment } from "@/lib/yukassa";
import {
  captureGraceExpiredSessions,
  startSessionForBooking,
} from "@/lib/session-payment";
import { completeBookingAtSessionEnd } from "@/lib/session-complete";

const NOW = new Date("2026-06-18T10:00:00.000Z");

function wireTx() {
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      booking: { updateMany: mockDb.booking.updateMany },
      payment: { update: mockDb.payment.update },
      payout: { create: mockDb.payout.create, updateMany: mockDb.payout.updateMany },
      practitioner: { update: mockDb.practitioner.update },
      transaction: { create: mockDb.transaction.create },
    }),
  );
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    clientId: "client-1",
    paymentId: "pay-1",
    payment: { externalId: "pay-1", status: "PENDING" },
    priceRub: 3000,
    status: "IN_PROGRESS",
    riskScore: 0,
    riskFlags: [],
    startedAt: new Date(NOW.getTime() - 50 * 60 * 1000),
    endedAt: null,
    commissionPercentApplied: null,
    practitioner: { id: "prac-1", userId: "practitioner-user-1", commissionPercent: 35 },
    slot: {
      startAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      endAt: NOW,
    },
    complaints: [],
    ...overrides,
  };
}

describe("B425 session dispute window", () => {
  let realDateNow: () => number;

  beforeEach(() => {
    jest.clearAllMocks();
    wireTx();
    mockDb.userSubscription.findMany.mockResolvedValue([]);
    mockDb.payment.findUnique.mockResolvedValue({
      externalId: "pay-1",
      status: "PENDING",
    });
    mockDb.booking.updateMany.mockResolvedValue({ count: 1 });
    mockDb.practitioner.update.mockResolvedValue({});
    mockDb.payout.create.mockResolvedValue({
      id: "payout-1",
      amountKopecks: 195_000,
      status: "HELD",
    });
    mockDb.payout.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payment.update.mockResolvedValue({});
    mockDb.transaction.create.mockResolvedValue({});
    (capturePayment as jest.Mock).mockResolvedValue({ status: "succeeded" });
    realDateNow = Date.now;
    Date.now = () => NOW.getTime();
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it("starts a confirmed session without capturing the card hold", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(booking({ status: "CONFIRMED" }));

    const outcome = await startSessionForBooking("booking-1");

    expect(outcome).toEqual({ status: "started" });
    expect(capturePayment).not.toHaveBeenCalled();
    expect(mockDb.payment.update).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
    expect(mockDb.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "booking-1", status: "CONFIRMED" },
      data: { status: "IN_PROGRESS", startedAt: NOW },
    });
  });

  it("completion creates a HELD payout until the 24h dispute window expires", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(booking());

    const outcome = await completeBookingAtSessionEnd("booking-1", {
      userId: "actor-1",
      isPractitioner: false,
    });

    expect(outcome.status).toBe("completed");
    expect(mockDb.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "HELD",
        holdReason: "dispute_window",
        availableAt: new Date("2026-06-19T10:00:00.000Z"),
      }),
      select: expect.any(Object),
    });
  });

  it("after 24h with no open dispute captures the hold and releases payout", async () => {
    mockDb.booking.findMany.mockResolvedValueOnce([{ id: "booking-1" }]);
    mockDb.booking.findUnique.mockResolvedValueOnce(booking({
      status: "COMPLETED",
      endedAt: new Date("2026-06-17T09:00:00.000Z"),
    }));

    const result = await captureGraceExpiredSessions(NOW);

    expect(result).toEqual({ scanned: 1, captured: 1 });
    expect(mockDb.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "COMPLETED",
        paymentId: { not: null },
        endedAt: { lte: new Date("2026-06-17T10:00:00.000Z") },
        complaints: { none: { status: { in: ["OPEN", "REVIEWING"] } } },
      }),
    }));
    expect(capturePayment).toHaveBeenCalledWith("pay-1", 300_000);
    expect(mockDb.payment.update).toHaveBeenCalledWith({
      where: { bookingId: "booking-1" },
      data: { status: "PAID" },
    });
    expect(mockDb.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "client-1",
        amount: -300_000,
        metadata: expect.objectContaining({ purchaseKind: "session", bookingId: "booking-1" }),
      }),
    });
    expect(mockDb.payout.updateMany).toHaveBeenCalledWith({
      where: { bookingId: "booking-1", status: "HELD", holdReason: "dispute_window" },
      data: expect.objectContaining({ status: "PENDING", holdReason: "payout_delay" }),
    });
  });
});
