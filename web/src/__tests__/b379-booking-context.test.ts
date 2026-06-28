import {
  MEETING_CONTEXT_MAX,
  MEETING_CONTEXT_MIN,
  MEETING_CONTEXT_REQUIRED_ERROR,
  shouldRequestMeetingContext,
  sanitizeMeetingContext,
  isMeetingContextRequired,
  validateMeetingContext,
} from "@/lib/booking-context";

describe("B379 — meeting context rule", () => {
  describe("shouldRequestMeetingContext", () => {
    it("asks for context when the practitioner has never been visited", () => {
      expect(
        shouldRequestMeetingContext({ practitionerId: "p1", visitedPractitionerIds: [] }),
      ).toBe(true);
      expect(
        shouldRequestMeetingContext({ practitionerId: "p1", visitedPractitionerIds: ["p2", "p3"] }),
      ).toBe(true);
    });

    it("skips context on a repeat booking with the same practitioner", () => {
      expect(
        shouldRequestMeetingContext({ practitionerId: "p1", visitedPractitionerIds: ["p1"] }),
      ).toBe(false);
      expect(
        shouldRequestMeetingContext({ practitionerId: "p1", visitedPractitionerIds: ["p2", "p1"] }),
      ).toBe(false);
    });
  });

  describe("sanitizeMeetingContext", () => {
    it("trims whitespace and returns the cleaned string", () => {
      expect(sanitizeMeetingContext("  тревога перед собеседованием  ")).toBe(
        "тревога перед собеседованием",
      );
    });

    it("returns null for empty / whitespace-only / non-string input", () => {
      expect(sanitizeMeetingContext("")).toBeNull();
      expect(sanitizeMeetingContext("    ")).toBeNull();
      expect(sanitizeMeetingContext(undefined)).toBeNull();
      expect(sanitizeMeetingContext(null)).toBeNull();
      expect(sanitizeMeetingContext(42)).toBeNull();
      expect(sanitizeMeetingContext({ text: "x" })).toBeNull();
    });

    it("clamps to the max length", () => {
      const long = "a".repeat(MEETING_CONTEXT_MAX + 50);
      const result = sanitizeMeetingContext(long);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(MEETING_CONTEXT_MAX);
    });
  });

  // B458 (item 14) — required-context rule for a first booking with a new practitioner.
  describe("isMeetingContextRequired", () => {
    it("required on a first booking, optional on a repeat", () => {
      expect(isMeetingContextRequired({ isFirstBookingWithPractitioner: true })).toBe(true);
      expect(isMeetingContextRequired({ isFirstBookingWithPractitioner: false })).toBe(false);
    });
  });

  describe("validateMeetingContext", () => {
    it("rejects empty / too-short context when required", () => {
      const empty = validateMeetingContext("   ", { required: true });
      expect(empty.ok).toBe(false);
      if (!empty.ok) expect(empty.error).toBe(MEETING_CONTEXT_REQUIRED_ERROR);

      const tooShort = validateMeetingContext("a".repeat(MEETING_CONTEXT_MIN - 1), { required: true });
      expect(tooShort.ok).toBe(false);
    });

    it("accepts a short genuine phrase when required", () => {
      const result = validateMeetingContext("  тревога ", { required: true });
      expect(result).toEqual({ ok: true, value: "тревога" });
    });

    it("allows empty context when not required (repeat booking)", () => {
      expect(validateMeetingContext("", { required: false })).toEqual({ ok: true, value: null });
      expect(validateMeetingContext("кратко", { required: false })).toEqual({ ok: true, value: "кратко" });
    });
  });
});
