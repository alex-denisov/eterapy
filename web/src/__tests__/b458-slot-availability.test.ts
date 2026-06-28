import {
  generatePotentialSlots,
  slotsOverlap,
  dayHasAvailability,
  calendarDateStr,
} from "@/lib/slot-availability";

const RULE = {
  startHour: 10,
  startMinute: 0,
  endHour: 20,
  endMinute: 0,
  enabled: true,
} as const;

// A date far in the future so "in the past" filtering never trips the tests.
const DAY = "2099-06-15"; // arbitrary future Monday-ish
const DISTANT_NOW = new Date("2099-06-15T00:00:00");

describe("B458 — slot-availability helpers", () => {
  describe("calendarDateStr", () => {
    it("zero-pads month and day (month is 0-based)", () => {
      expect(calendarDateStr(2026, 0, 5)).toBe("2026-01-05");
      expect(calendarDateStr(2026, 11, 31)).toBe("2026-12-31");
    });
  });

  describe("slotsOverlap", () => {
    it("touching edges do NOT overlap", () => {
      const a = new Date(`${DAY}T14:00:00`);
      const b = new Date(`${DAY}T15:00:00`);
      const c = new Date(`${DAY}T16:00:00`);
      expect(slotsOverlap(a, b, b, c)).toBe(false);
    });
    it("crossing intervals overlap", () => {
      const a = new Date(`${DAY}T14:00:00`);
      const b = new Date(`${DAY}T15:30:00`);
      const c = new Date(`${DAY}T15:00:00`);
      const d = new Date(`${DAY}T16:00:00`);
      expect(slotsOverlap(a, b, c, d)).toBe(true);
    });
  });

  describe("generatePotentialSlots", () => {
    it("produces back-to-back 60-min slots across a 10:00–20:00 day", () => {
      const slots = generatePotentialSlots(DAY, RULE, 60);
      expect(slots).toHaveLength(10); // 10:00..19:00 starts
      expect(slots[0].startAt).toEqual(new Date(`${DAY}T10:00:00`));
      expect(slots[0].endAt).toEqual(new Date(`${DAY}T11:00:00`));
      expect(slots[slots.length - 1].startAt).toEqual(new Date(`${DAY}T19:00:00`));
    });

    it("aligns the start up to the nearest duration step", () => {
      const slots = generatePotentialSlots(DAY, { ...RULE, startMinute: 20 }, 60);
      // 10:20 rounds up to 11:00
      expect(slots[0].startAt).toEqual(new Date(`${DAY}T11:00:00`));
    });

    it("returns nothing for a disabled rule or non-positive duration", () => {
      expect(generatePotentialSlots(DAY, { ...RULE, enabled: false }, 60)).toEqual([]);
      expect(generatePotentialSlots(DAY, RULE, 0)).toEqual([]);
    });
  });

  describe("dayHasAvailability", () => {
    const base = {
      dateStr: DAY,
      rule: RULE,
      durationMin: 60,
      blocked: [],
      booked: [],
      unavailable: [],
      persistedAvailable: [],
      now: DISTANT_NOW,
    };

    it("true when the rule yields a future, unobstructed slot", () => {
      expect(dayHasAvailability(base)).toBe(true);
    });

    it("false without a rule and no persisted slots", () => {
      expect(dayHasAvailability({ ...base, rule: null })).toBe(false);
      expect(dayHasAvailability({ ...base, rule: { ...RULE, enabled: false } })).toBe(false);
    });

    it("false when every generated slot is blocked / booked / unavailable", () => {
      const wholeDay = [{ startAt: new Date(`${DAY}T00:00:00`), endAt: new Date(`${DAY}T23:59:59`) }];
      expect(dayHasAvailability({ ...base, blocked: wholeDay })).toBe(false);
      expect(dayHasAvailability({ ...base, booked: wholeDay })).toBe(false);
      expect(dayHasAvailability({ ...base, unavailable: wholeDay })).toBe(false);
    });

    it("true when only some slots are blocked", () => {
      const morning = [{ startAt: new Date(`${DAY}T10:00:00`), endAt: new Date(`${DAY}T12:00:00`) }];
      expect(dayHasAvailability({ ...base, blocked: morning })).toBe(true);
    });

    it("false when all rule slots are in the past", () => {
      expect(dayHasAvailability({ ...base, now: new Date(`${DAY}T23:00:00`) })).toBe(false);
    });

    it("true on a ruleless day that has a future persisted one-off slot", () => {
      expect(
        dayHasAvailability({
          ...base,
          rule: null,
          persistedAvailable: [{ startAt: new Date(`${DAY}T13:00:00`), endAt: new Date(`${DAY}T14:00:00`) }],
        }),
      ).toBe(true);
    });
  });
});
