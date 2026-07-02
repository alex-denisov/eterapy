// B464 IB4 — pure gating for the client booking actions (owner round-3 #5),
// grounded in api/bookings/[id]/route.ts. Kept side-effect-free and time-injected
// so the windows are unit-testable.

export interface BookingSlotLike {
  startAt: string;
  endAt: string;
}

export interface BookingLike {
  status: string;
  slot: BookingSlotLike | null;
}

// «Войти в сессию» opens 30 мин before the start and closes 30 мин after the end.
export const JOIN_WINDOW_MS = 30 * 60 * 1000;
// «Отменить» is available only while PENDING and more than 24h before the start.
export const CANCEL_MIN_LEAD_MS = 24 * 60 * 60 * 1000;

export function canJoinBooking(b: BookingLike, nowMs: number = Date.now()): boolean {
  if (!["CONFIRMED", "IN_PROGRESS"].includes(b.status) || !b.slot) return false;
  const start = new Date(b.slot.startAt).getTime();
  const end = new Date(b.slot.endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return nowMs >= start - JOIN_WINDOW_MS && nowMs <= end + JOIN_WINDOW_MS;
}

export function canCancelBooking(b: BookingLike, nowMs: number = Date.now()): boolean {
  if (b.status !== "PENDING" || !b.slot) return false;
  const start = new Date(b.slot.startAt).getTime();
  if (Number.isNaN(start)) return false;
  return start - nowMs > CANCEL_MIN_LEAD_MS;
}

export function bookingDurationMin(b: BookingLike): number | null {
  if (!b.slot) return null;
  const ms = new Date(b.slot.endAt).getTime() - new Date(b.slot.startAt).getTime();
  return ms > 0 ? Math.round(ms / 60000) : null;
}
