import {
  MEETING_CONTEXT_MAX,
  shouldRequestMeetingContext,
  sanitizeMeetingContext,
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
});
