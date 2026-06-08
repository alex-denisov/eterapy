import { readFileSync } from "fs";
import { join } from "path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * M25 — Баги 14 & 15: a cancelled booking must free its slot for re-booking,
 * and touching time intervals must not collide.
 */
describe("M25 booking slot release", () => {
  it("Баг 14: cancellation detaches slotId from the terminal booking", () => {
    const route = source("src/app/api/bookings/[id]/route.ts");
    // Booking.slotId is @unique, so the cancelled booking must release it.
    expect(route).toMatch(/status === "CANCELLED"[\s\S]{0,1500}slotId: null/);
  });

  it("Механика 11: client cannot cancel after confirmation or inside 24h", () => {
    const route = source("src/app/api/bookings/[id]/route.ts");
    expect(route).toContain('["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status)');
    expect(route).toContain("24 * 60 * 60 * 1000");
  });

  it("Баг 15: manual-interval conflict checks use strict (non-touching) bounds", () => {
    const route = source("src/app/api/bookings/route.ts");
    // The existingBooking / existingSlot conflict checks must use lt/gt, not
    // lte/gte, so a 14:00–15:00 booking does not block a 15:00–16:00 request.
    const existingBookingBlock = route.slice(
      route.indexOf("const existingBooking"),
      route.indexOf("const createdSlot"),
    );
    expect(existingBookingBlock).toContain("startAt: { lt: requestedEndAt }");
    expect(existingBookingBlock).toContain("endAt: { gt: requestedStartAt }");
    expect(existingBookingBlock).not.toContain("lte: requestedEndAt");
    expect(existingBookingBlock).not.toContain("gte: requestedStartAt");
  });
});
