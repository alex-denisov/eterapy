import {
  SESSION_FORMATS,
  SESSION_FORMAT_IDS,
  DEFAULT_SESSION_FORMAT,
  isSessionFormat,
  sessionFormatLabel,
  normalizeOfferedFormats,
  offeredFormatOptions,
  normalizeBookingFormat,
} from "@/lib/session-formats";

// B466/B480 — «форматы сессий» (индивидуальная/парная/семейная) as a real,
// bookable attribute. Pure client-safe lib shared by the landing, the cabinet
// «Услуги» editor, the superadmin modal, «Записать» and the session card.

describe("session-formats catalog", () => {
  it("exposes individual/couple/family in canonical order", () => {
    expect(SESSION_FORMAT_IDS).toEqual(["individual", "couple", "family"]);
  });

  it("labels are Russian, no generic «терапия»", () => {
    const labels = SESSION_FORMATS.map((f) => f.label);
    expect(labels).toEqual(["Индивидуальная", "Парная", "Семейная"]);
    expect(labels.join(" ").toLowerCase()).not.toContain("терапия");
  });

  it("default format is individual", () => {
    expect(DEFAULT_SESSION_FORMAT).toBe("individual");
  });
});

describe("isSessionFormat", () => {
  it("accepts known ids, rejects the rest", () => {
    expect(isSessionFormat("couple")).toBe(true);
    expect(isSessionFormat("family")).toBe(true);
    expect(isSessionFormat("group")).toBe(false);
    expect(isSessionFormat("")).toBe(false);
  });
});

describe("sessionFormatLabel", () => {
  it("maps id → label", () => {
    expect(sessionFormatLabel("couple")).toBe("Парная");
    expect(sessionFormatLabel("family")).toBe("Семейная");
  });

  it("falls back to individual for null/undefined/unknown", () => {
    expect(sessionFormatLabel(null)).toBe("Индивидуальная");
    expect(sessionFormatLabel(undefined)).toBe("Индивидуальная");
    expect(sessionFormatLabel("nonsense")).toBe("Индивидуальная");
  });
});

describe("normalizeOfferedFormats", () => {
  it("keeps only valid ids, dedupes, preserves canonical order (individual guaranteed)", () => {
    expect(normalizeOfferedFormats(["family", "couple", "family", "junk"])).toEqual([
      "individual",
      "couple",
      "family",
    ]);
  });

  it("always guarantees individual is offered", () => {
    expect(normalizeOfferedFormats([])).toEqual(["individual"]);
    expect(normalizeOfferedFormats(["couple"])).toEqual(["individual", "couple"]);
    expect(normalizeOfferedFormats(null)).toEqual(["individual"]);
    expect(normalizeOfferedFormats("couple")).toEqual(["individual"]);
  });
});

describe("offeredFormatOptions", () => {
  it("resolves ids to {id,label} options in canonical order", () => {
    expect(offeredFormatOptions(["couple"])).toEqual([
      { id: "individual", label: "Индивидуальная", hint: expect.any(String) },
      { id: "couple", label: "Парная", hint: expect.any(String) },
    ]);
  });

  it("defaults to a single individual option when nothing offered", () => {
    expect(offeredFormatOptions([]).map((o) => o.id)).toEqual(["individual"]);
    expect(offeredFormatOptions(undefined).map((o) => o.id)).toEqual(["individual"]);
  });
});

describe("normalizeBookingFormat", () => {
  it("returns a single valid id or the default", () => {
    expect(normalizeBookingFormat("couple")).toBe("couple");
    expect(normalizeBookingFormat("family")).toBe("family");
    expect(normalizeBookingFormat("group")).toBe("individual");
    expect(normalizeBookingFormat(null)).toBe("individual");
    expect(normalizeBookingFormat(42)).toBe("individual");
  });

  it("rejects a format the practitioner does not offer", () => {
    // when an `offered` allow-list is supplied, an un-offered choice degrades to default
    expect(normalizeBookingFormat("family", ["individual", "couple"])).toBe("individual");
    expect(normalizeBookingFormat("couple", ["individual", "couple"])).toBe("couple");
  });
});
