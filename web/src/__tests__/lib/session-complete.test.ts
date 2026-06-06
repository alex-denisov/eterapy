/**
 * Unit tests for session-end completion + payout gating (backlog 11.C.2).
 *
 *   - Releases payout (status PENDING) when no unresolved complaint exists.
 *   - Holds payout (status HELD) when an OPEN/REVIEWING complaint exists.
 *   - Blocks COMPLETED transition when the practitioner ends < 75% in.
 *   - Idempotent: already-COMPLETED bookings are a no-op.
 *   - Stores payout amount in kopecks (priceRub × 100, then × 1-commission).
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    booking: { findUnique: jest.fn(), updateMany: jest.fn() },
    practitioner: { update: jest.fn() },
    payout: { create: jest.fn() },
    userSubscription: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import db from "@/lib/db";
import {
  completeBookingAtSessionEnd,
  PAYOUT_STATUS_HELD,
  PAYOUT_STATUS_PENDING,
} from "@/lib/session-complete";

type MockedPrisma = {
  booking: { findUnique: jest.Mock; updateMany: jest.Mock };
  practitioner: { update: jest.Mock };
  payout: { create: jest.Mock };
  userSubscription: { findMany: jest.Mock };
  $transaction: jest.Mock;
};
const mockDb = db as unknown as MockedPrisma;

function resetAll() {
  mockDb.booking.findUnique.mockReset();
  mockDb.booking.updateMany.mockReset();
  mockDb.practitioner.update.mockReset();
  mockDb.payout.create.mockReset();
  mockDb.userSubscription.findMany.mockReset();
  mockDb.$transaction.mockReset();
}

function wireTx() {
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      booking: { updateMany: mockDb.booking.updateMany },
      practitioner: { update: mockDb.practitioner.update },
      payout: { create: mockDb.payout.create },
    }),
  );
}

const NOW = Date.UTC(2026, 3, 24, 12, 0, 0); // 2026-04-24T12:00:00Z

function bookingFixture(overrides: Partial<{
  status: string;
  priceRub: number;
  startedAt: Date | null;
  slot: { startAt: Date; endAt: Date } | null;
  commissionPercent: number;
  commissionPercentApplied: number | null;
  complaints: { id: string; status: string }[];
  practitionerUserId: string;
  riskScore: number;
  riskFlags: string[];
}> = {}) {
  return {
    id: "b1",
    status: overrides.status ?? "IN_PROGRESS",
    priceRub: overrides.priceRub ?? 3000,
    riskScore: overrides.riskScore ?? 0,
    riskFlags: overrides.riskFlags ?? [],
    startedAt: overrides.startedAt ?? new Date(NOW - 50 * 60 * 1000), // 50 min ago
    practitioner: {
      id: "p1",
      userId: overrides.practitionerUserId ?? "uPrac",
      commissionPercent: overrides.commissionPercent ?? 35,
    },
    commissionPercentApplied: overrides.commissionPercentApplied ?? null,
    slot:
      overrides.slot === undefined
        ? { startAt: new Date(NOW - 60 * 60 * 1000), endAt: new Date(NOW) }
        : overrides.slot,
    complaints: overrides.complaints ?? [],
  };
}

describe("completeBookingAtSessionEnd", () => {
  let realDateNow: () => number;
  beforeEach(() => {
    resetAll();
    wireTx();
    mockDb.userSubscription.findMany.mockResolvedValue([]);
    realDateNow = Date.now;
    Date.now = () => NOW;
  });
  afterEach(() => {
    Date.now = realDateNow;
  });

  it("creates a PENDING payout in kopecks when no unresolved complaint exists", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(bookingFixture());
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.practitioner.update.mockResolvedValueOnce({});
    mockDb.payout.create.mockResolvedValueOnce({
      id: "po1",
      amountKopecks: 195_000,
      status: "PENDING",
    });

    const out = await completeBookingAtSessionEnd("b1", {
      userId: "uAdmin",
      isPractitioner: false,
    });

    expect(out).toEqual({
      status: "completed",
      payout: { id: "po1", amountKopecks: 195_000, status: PAYOUT_STATUS_PENDING },
    });
    // priceRub 3000 * 100 = 300_000 kopecks; minus 35% commission = 195_000.
    expect(mockDb.payout.create).toHaveBeenCalledWith({
      data: {
        practitionerId: "p1",
        bookingId: "b1",
        amountKopecks: 195_000,
        status: PAYOUT_STATUS_PENDING,
        initiatedBy: "uAdmin",
        availableAt: new Date("2026-05-08T12:00:00.000Z"),
        holdReason: "payout_delay",
        holdDays: 14,
        planKeyAtPayout: "base",
        reserveKopecks: 0,
        riskScore: 0,
        riskFlags: [],
      },
      select: expect.any(Object),
    });
    expect(mockDb.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b1", status: "IN_PROGRESS" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("creates a HELD payout when an OPEN complaint exists on the booking", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(
      bookingFixture({ complaints: [{ id: "c1", status: "OPEN" }] }),
    );
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.practitioner.update.mockResolvedValueOnce({});
    mockDb.payout.create.mockResolvedValueOnce({
      id: "po1",
      amountKopecks: 195_000,
      status: PAYOUT_STATUS_HELD,
    });

    const out = await completeBookingAtSessionEnd("b1", {
      userId: "uAdmin",
      isPractitioner: false,
    });

    expect(out).toEqual({
      status: "completed",
      payout: {
        id: "po1",
        amountKopecks: 195_000,
        status: PAYOUT_STATUS_HELD,
        holdReason: "open_complaint",
      },
    });
    expect(mockDb.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: PAYOUT_STATUS_HELD }),
      select: expect.any(Object),
    });
  });

  it("treats REVIEWING complaints as unresolved (still HELD)", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(
      bookingFixture({ complaints: [{ id: "c1", status: "REVIEWING" }] }),
    );
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.practitioner.update.mockResolvedValueOnce({});
    mockDb.payout.create.mockResolvedValueOnce({
      id: "po2",
      amountKopecks: 195_000,
      status: PAYOUT_STATUS_HELD,
    });

    const out = await completeBookingAtSessionEnd("b1", {
      userId: "uAdmin",
      isPractitioner: false,
    });
    if (out.status !== "completed") throw new Error("expected completed");
    expect(out.payout.status).toBe(PAYOUT_STATUS_HELD);
  });

  it("does NOT hold when complaints exist but are all RESOLVED/CLOSED", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(
      bookingFixture({
        complaints: [
          { id: "c1", status: "RESOLVED" },
          { id: "c2", status: "CLOSED" },
        ],
      }),
    );
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.practitioner.update.mockResolvedValueOnce({});
    mockDb.payout.create.mockResolvedValueOnce({
      id: "po3",
      amountKopecks: 195_000,
      status: PAYOUT_STATUS_PENDING,
    });

    const out = await completeBookingAtSessionEnd("b1", {
      userId: "uAdmin",
      isPractitioner: false,
    });
    if (out.status !== "completed") throw new Error("expected completed");
    expect(out.payout.status).toBe(PAYOUT_STATUS_PENDING);
  });

  it("blocks early-end when actor is the practitioner and < 75% elapsed", async () => {
    // Slot is 60 min long, started 30 min ago → 50% elapsed → below 75% threshold.
    mockDb.booking.findUnique.mockResolvedValueOnce(
      bookingFixture({
        startedAt: new Date(NOW - 30 * 60 * 1000),
        slot: {
          startAt: new Date(NOW - 30 * 60 * 1000),
          endAt: new Date(NOW + 30 * 60 * 1000),
        },
      }),
    );

    const out = await completeBookingAtSessionEnd("b1", {
      userId: "uPrac",
      isPractitioner: true,
    });

    expect(out.status).toBe("early_end_blocked");
    if (out.status !== "early_end_blocked") throw new Error("expected early_end_blocked");
    expect(out.elapsedMs).toBe(30 * 60 * 1000);
    expect(out.requiredMs).toBe(45 * 60 * 1000);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.payout.create).not.toHaveBeenCalled();
  });

  it("does not block early-end when actor is admin even at < 75% elapsed", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(
      bookingFixture({
        startedAt: new Date(NOW - 10 * 60 * 1000),
        slot: {
          startAt: new Date(NOW - 10 * 60 * 1000),
          endAt: new Date(NOW + 50 * 60 * 1000),
        },
      }),
    );
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.practitioner.update.mockResolvedValueOnce({});
    mockDb.payout.create.mockResolvedValueOnce({
      id: "po4",
      amountKopecks: 195_000,
      status: PAYOUT_STATUS_PENDING,
    });

    const out = await completeBookingAtSessionEnd("b1", {
      userId: "uAdmin",
      isPractitioner: false,
    });
    expect(out.status).toBe("completed");
  });

  it("returns already_completed for COMPLETED bookings without side effects", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(
      bookingFixture({ status: "COMPLETED" }),
    );

    const out = await completeBookingAtSessionEnd("b1", {
      userId: "uAdmin",
      isPractitioner: false,
    });
    expect(out).toEqual({ status: "already_completed" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("returns invalid_status for non-IN_PROGRESS bookings (e.g. CANCELLED)", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(
      bookingFixture({ status: "CANCELLED" }),
    );

    const out = await completeBookingAtSessionEnd("b1", {
      userId: "uAdmin",
      isPractitioner: false,
    });
    expect(out).toEqual({ status: "invalid_status", currentStatus: "CANCELLED" });
  });

  it("rounds payout kopecks correctly for non-divisible commission rates", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(
      bookingFixture({ priceRub: 1234, commissionPercent: 17 }),
    );
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.practitioner.update.mockResolvedValueOnce({});
    mockDb.payout.create.mockResolvedValueOnce({
      id: "po5",
      amountKopecks: 102_422,
      status: PAYOUT_STATUS_PENDING,
    });

    await completeBookingAtSessionEnd("b1", { userId: "u", isPractitioner: false });

    // 1234 * 100 = 123_400 kopecks; * (1 - 0.17) = 102_422 kopecks.
    expect(mockDb.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountKopecks: 102_422 }),
      select: expect.any(Object),
    });
  });

  it("uses the booking commission snapshot over the live practitioner rate", async () => {
    mockDb.booking.findUnique.mockResolvedValueOnce(
      bookingFixture({ priceRub: 10_000, commissionPercent: 35, commissionPercentApplied: 30 }),
    );
    mockDb.booking.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.practitioner.update.mockResolvedValueOnce({});
    mockDb.payout.create.mockResolvedValueOnce({
      id: "po6",
      amountKopecks: 700_000,
      status: PAYOUT_STATUS_PENDING,
    });

    await completeBookingAtSessionEnd("b1", { userId: "u", isPractitioner: false });

    expect(mockDb.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountKopecks: 700_000 }),
      select: expect.any(Object),
    });
  });
});
