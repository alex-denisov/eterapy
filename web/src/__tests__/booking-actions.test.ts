import { canJoinBooking, canCancelBooking, bookingDurationMin } from "@/lib/booking-actions";

const slot = (startMin: number, durMin = 50) => {
  const start = Date.now() + startMin * 60_000;
  return { startAt: new Date(start).toISOString(), endAt: new Date(start + durMin * 60_000).toISOString() };
};

describe("B464 IB4 booking-actions — join window", () => {
  it("opens 30 мин before start and stays open until 30 мин after end", () => {
    const b = { status: "CONFIRMED", slot: slot(20) }; // starts in 20 мин
    expect(canJoinBooking(b)).toBe(true);
  });

  it("is closed more than 30 мин before start", () => {
    expect(canJoinBooking({ status: "CONFIRMED", slot: slot(45) })).toBe(false);
  });

  it("is closed more than 30 мин after end", () => {
    expect(canJoinBooking({ status: "CONFIRMED", slot: slot(-120, 50) })).toBe(false);
  });

  it("never opens for PENDING or COMPLETED", () => {
    expect(canJoinBooking({ status: "PENDING", slot: slot(10) })).toBe(false);
    expect(canJoinBooking({ status: "COMPLETED", slot: slot(0) })).toBe(false);
  });
});

describe("B464 IB4 booking-actions — cancel window", () => {
  it("allows cancel only while PENDING and >24h before start", () => {
    expect(canCancelBooking({ status: "PENDING", slot: slot(60 * 25) })).toBe(true);
    expect(canCancelBooking({ status: "PENDING", slot: slot(60 * 12) })).toBe(false);
  });

  it("blocks cancel once CONFIRMED (API sends users to support)", () => {
    expect(canCancelBooking({ status: "CONFIRMED", slot: slot(60 * 48) })).toBe(false);
  });
});

describe("B464 IB4 booking-actions — duration", () => {
  it("rounds slot length to minutes", () => {
    expect(bookingDurationMin({ status: "CONFIRMED", slot: slot(10, 50) })).toBe(50);
    expect(bookingDurationMin({ status: "CONFIRMED", slot: null })).toBeNull();
  });
});
