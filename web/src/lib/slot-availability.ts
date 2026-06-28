/**
 * B458 (M28, walkthrough items 12–13) — pure slot-availability helpers shared by
 * the single-day route (`/api/slots/available`) and the new month-availability
 * route (`/api/slots/month`). The month route powers the booking calendar so it
 * highlights only days that actually have bookable slots, auto-advances to the
 * first month with availability, and auto-selects the earliest available date.
 *
 * Kept pure (no DB, no `next/server`) so it is cheaply unit-testable and reusable.
 */

export interface ScheduleRuleLike {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  enabled: boolean;
}

export interface SlotInterval {
  startAt: Date;
  endAt: Date;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for a calendar day (pure arithmetic, timezone-agnostic). */
export function calendarDateStr(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

/** Two [start,end) intervals overlap iff they strictly cross — touching edges don't. */
export function slotsOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}

/**
 * Generate the aligned, back-to-back potential slots for one working day, mirroring
 * `/api/slots/available`: the day start is rounded up to the nearest `durationMin`
 * step, and slots run until they no longer fit before the rule's end.
 */
export function generatePotentialSlots(
  dateStr: string,
  rule: ScheduleRuleLike,
  durationMin: number,
): SlotInterval[] {
  if (!rule.enabled || durationMin <= 0) return [];

  const alignedStartMin = Math.ceil(rule.startMinute / durationMin) * durationMin;
  const alignedStartHour = alignedStartMin >= 60 ? rule.startHour + 1 : rule.startHour;
  const finalStartMin = alignedStartMin >= 60 ? 0 : alignedStartMin;

  const dayStart = new Date(`${dateStr}T${pad2(alignedStartHour)}:${pad2(finalStartMin)}:00`);
  const dayEnd = new Date(`${dateStr}T${pad2(rule.endHour)}:${pad2(rule.endMinute)}:00`);

  const slots: SlotInterval[] = [];
  let cur = dayStart.getTime();
  const stepMs = durationMin * 60000;
  while (cur + stepMs <= dayEnd.getTime()) {
    slots.push({ startAt: new Date(cur), endAt: new Date(cur + stepMs) });
    cur += stepMs;
  }
  return slots;
}

/**
 * Does this calendar day have at least one bookable slot for `durationMin`?
 *
 * The interval arrays (`blocked`/`booked`/`unavailable`/`persistedAvailable`) are
 * expected to already be scoped to this day. A future persisted-available one-off
 * slot makes the day bookable even without a weekly rule; otherwise we generate
 * the rule's slots and require at least one that is in the future and free of any
 * blocked / booked / unavailable overlap.
 */
export function dayHasAvailability(opts: {
  dateStr: string;
  rule: ScheduleRuleLike | null | undefined;
  durationMin: number;
  blocked: SlotInterval[];
  booked: SlotInterval[];
  unavailable: SlotInterval[];
  persistedAvailable: SlotInterval[];
  now: Date;
}): boolean {
  const { dateStr, rule, durationMin, blocked, booked, unavailable, persistedAvailable, now } = opts;

  // One-off persisted available slot still in the future → bookable.
  if (persistedAvailable.some((s) => s.startAt > now)) return true;

  if (!rule || !rule.enabled) return false;

  const potential = generatePotentialSlots(dateStr, rule, durationMin);
  return potential.some((slot) => {
    if (slot.startAt <= now) return false;
    if (blocked.some((b) => slotsOverlap(slot.startAt, slot.endAt, b.startAt, b.endAt))) return false;
    if (booked.some((b) => slotsOverlap(slot.startAt, slot.endAt, b.startAt, b.endAt))) return false;
    if (unavailable.some((u) => slotsOverlap(slot.startAt, slot.endAt, u.startAt, u.endAt))) return false;
    return true;
  });
}
