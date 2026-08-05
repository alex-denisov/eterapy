import { practitionerHelpChips } from "@/lib/practitioner-chips";

describe("B457 practitionerHelpChips", () => {
  it("prefers concrete tasks over direction/specialty labels that echo the title", () => {
    // Алиса Бабаева: title «Астролог, нумеролог» + directions echoing it.
    // The card/profile should surface the tasks she actually helps with.
    const chips = practitionerHelpChips({
      directions: ["astrology", "numerology"],
      specialties: ["ASTROLOGY", "NUMEROLOGY"],
      tags: ["Отношения", "Карьера", "Самопознание"],
    });
    expect(chips).toEqual(["Отношения", "Карьера", "Самопознание"]);
    // none of the title-echoing method labels leak in
    expect(chips).not.toContain("Астрология");
    expect(chips).not.toContain("Нумерология");
  });

  it("falls back to direction labels when no tasks are set", () => {
    const chips = practitionerHelpChips({ directions: ["cbt"], tags: [] });
    expect(chips).toEqual(["КПТ (когнитивно-поведенческая)"]);
  });

  it("falls back to legacy specialty labels when no tasks or directions", () => {
    const chips = practitionerHelpChips({ specialties: ["TAROT", "RUNES"] });
    expect(chips).toEqual(["Таро", "Руны"]);
  });

  it("dedups case-insensitively and keeps first occurrence", () => {
    const chips = practitionerHelpChips({ tags: ["Тревога", "тревога", "ТРЕВОГА", "Стресс"] });
    expect(chips).toEqual(["Тревога", "Стресс"]);
  });

  it("normalizes case by capitalizing the first letter", () => {
    expect(practitionerHelpChips({ tags: ["тревога", "выгорание"] })).toEqual([
      "Тревога",
      "Выгорание",
    ]);
    // already-cased / acronym labels are left intact
    expect(practitionerHelpChips({ tags: ["КПТ", "EMDR"] })).toEqual(["КПТ", "EMDR"]);
  });

  it("ignores empty / nullish input", () => {
    expect(practitionerHelpChips({})).toEqual([]);
    expect(practitionerHelpChips({ tags: [], directions: [], specialties: [] })).toEqual([]);
    expect(practitionerHelpChips({ tags: ["", "  "] })).toEqual([]);
  });
});
