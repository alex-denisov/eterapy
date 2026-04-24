/**
 * Unit tests for the session-start charge helper.
 *
 * Covers the fixes from backlog 11.C.1:
 *   - priceRub → kopecks conversion (×100).
 *   - Race-safe conditional flip CONFIRMED → IN_PROGRESS.
 *   - Overdraft-safe conditional balance decrement.
 *   - Transaction row written for the billing history (/cabinet/billing).
 *   - Idempotency: second call after a successful charge is a no-op.
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    booking: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import db from "@/lib/db";
import { chargeClientForSession } from "@/lib/session-charge";

type MockedPrisma = {
  booking: { findUnique: jest.Mock; updateMany: jest.Mock };
  user: { findUnique: jest.Mock; updateMany: jest.Mock };
  payment: { create: jest.Mock };
  transaction: { create: jest.Mock };
  $transaction: jest.Mock;
};

const mockDb = db as unknown as MockedPrisma;

function resetAll() {
  mockDb.booking.findUnique.mockReset();
  mockDb.booking.updateMany.mockReset();
  mockDb.user.findUnique.mockReset();
  mockDb.user.updateMany.mockReset();
  mockDb.payment.create.mockReset();
  mockDb.transaction.create.mockReset();
  mockDb.$transaction.mockReset();
}

function makeTxDouble() {
  // The tx object passed to the $transaction callback mirrors the top-level
  // prisma surface we use. We return the same mock functions so assertions in
  // each test inspect them directly.
  return {
    booking: { updateMany: mockDb.booking.updateMany },
    user: {
      findUnique: mockDb.user.findUnique,
      updateMany: mockDb.user.updateMany,
    },
    payment: { create: mockDb.payment.create },
    transaction: { create: mockDb.transaction.create },
  };
}

function wireTransaction() {
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
    return cb(makeTxDouble());
  });
}

describe("chargeClientForSession", () => {
  beforeEach(() => {
    resetAll();
    wireTransaction();
  });

  it("charges priceRub × 100 kopecks and writes payment + transaction rows", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({
      id: "b1",
      clientId: "u1",
      priceRub: 3000,
      status: "CONFIRMED",
    });
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.user.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.user.findUnique.mockResolvedValueOnce({ balance: 200_000 }); // 500_000 - 300_000 left 200_000
    mockDb.payment.create.mockResolvedValueOnce({});
    mockDb.transaction.create.mockResolvedValueOnce({});

    const out = await chargeClientForSession("b1");

    expect(out).toEqual({
      status: "charged",
      priceKopecks: 300_000,
      newBalanceKopecks: 200_000,
    });

    expect(mockDb.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "CONFIRMED" },
      data: { status: "IN_PROGRESS" },
    });
    expect(mockDb.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", balance: { gte: 300_000 } },
      data: { balance: { decrement: 300_000 } },
    });
    expect(mockDb.payment.create).toHaveBeenCalledWith({
      data: {
        bookingId: "b1",
        amountKopecks: 300_000,
        currency: "RUB",
        status: "PAID",
      },
    });
    expect(mockDb.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        amount: -300_000,
        status: "SUCCEEDED",
        provider: "internal",
        description: "Оплата сессии b1",
      },
    });
  });

  it("returns already_charged when booking is already IN_PROGRESS (skips tx entirely)", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({
      id: "b1",
      clientId: "u1",
      priceRub: 3000,
      status: "IN_PROGRESS",
    });

    const out = await chargeClientForSession("b1");

    expect(out).toEqual({ status: "already_charged" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.payment.create).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
  });

  it("returns already_charged when concurrent caller wins the flip (count=0)", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({
      id: "b1",
      clientId: "u1",
      priceRub: 3000,
      status: "CONFIRMED",
    });
    // The other tab already flipped CONFIRMED → IN_PROGRESS.
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 0 });

    const out = await chargeClientForSession("b1");

    expect(out).toEqual({ status: "already_charged" });
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockDb.payment.create).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
  });

  it("returns insufficient_balance when conditional decrement finds nothing to update", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({
      id: "b1",
      clientId: "u1",
      priceRub: 3000,
      status: "CONFIRMED",
    });
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    // `balance >= priceKopecks` is false → count=0.
    mockDb.user.updateMany.mockResolvedValueOnce({ count: 0 });
    mockDb.user.findUnique.mockResolvedValueOnce({ balance: 50_000 });

    const out = await chargeClientForSession("b1");

    expect(out).toEqual({
      status: "insufficient_balance",
      balanceKopecks: 50_000,
      priceKopecks: 300_000,
    });
    expect(mockDb.payment.create).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
  });

  it("returns invalid_status for non-CONFIRMED bookings (e.g. CANCELLED)", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({
      id: "b1",
      clientId: "u1",
      priceRub: 3000,
      status: "CANCELLED",
    });

    const out = await chargeClientForSession("b1");

    expect(out).toEqual({ status: "invalid_status", currentStatus: "CANCELLED" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("flips status without billing side effects when priceRub is 0 (test mode)", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce({
      id: "b1",
      clientId: "u1",
      priceRub: 0,
      status: "CONFIRMED",
    });
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });

    const out = await chargeClientForSession("b1");

    expect(out).toEqual({ status: "charged", priceKopecks: 0, newBalanceKopecks: 0 });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockDb.payment.create).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
  });
});
