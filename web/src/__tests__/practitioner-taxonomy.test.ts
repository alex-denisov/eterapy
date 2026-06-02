import {
  CATEGORIES,
  directionsForCategories,
  tasksForCategories,
  categoryIdForDirection,
  specialtiesForDirections,
  directionsForSpecialties,
  detectCategoriesFromLegacy,
  effectiveCategories,
  categoryLabel,
  directionLabel,
} from "@/lib/practitioner-taxonomy";

describe("W3 practitioner taxonomy", () => {
  it("exposes the six canonical specializations", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      "psychology", "coaching", "legal", "finance", "esoteric", "joint",
    ]);
    expect(categoryLabel("psychology")).toBe("Психология");
    expect(categoryLabel("joint")).toBe("Совместные сессии");
  });

  it("scopes directions to the selected categories", () => {
    const dirs = directionsForCategories(["psychology"]).map((d) => d.id);
    expect(dirs).toContain("cbt");
    expect(dirs).toContain("gestalt");
    // a legal direction must not leak into a psychology-only selection
    expect(dirs).not.toContain("family-law");
  });

  it("merges directions across multiple categories", () => {
    const dirs = directionsForCategories(["psychology", "legal"]).map((d) => d.id);
    expect(dirs).toContain("cbt");
    expect(dirs).toContain("family-law");
  });

  it("maps a direction back to its parent category", () => {
    expect(categoryIdForDirection("cbt")).toBe("psychology");
    expect(categoryIdForDirection("tarot")).toBe("esoteric");
    expect(categoryIdForDirection("unknown")).toBeNull();
  });

  it("suggests tasks for the selected categories without duplicates", () => {
    const tasks = tasksForCategories(["psychology"]);
    expect(tasks).toContain("Тревога");
    expect(tasks).toContain("Депрессия");
    const unique = new Set(tasks.map((t) => t.toLocaleLowerCase("ru-RU")));
    expect(unique.size).toBe(tasks.length);
  });

  it("round-trips esoteric directions ↔ Specialty enum", () => {
    expect(specialtiesForDirections(["tarot", "astrology"])).toEqual(["TAROT", "ASTROLOGY"]);
    expect(directionsForSpecialties(["TAROT", "RUNES"])).toEqual(["tarot", "runes"]);
    // non-esoteric directions never produce a Specialty value
    expect(specialtiesForDirections(["cbt"])).toEqual([]);
    expect(directionLabel("tarot")).toBe("Таро");
  });

  it("infers categories from legacy title keywords", () => {
    expect(detectCategoriesFromLegacy({ title: "Клинический психолог" })).toEqual(["psychology"]);
    expect(detectCategoriesFromLegacy({ title: "Карьерный коуч" })).toEqual(["coaching"]);
    expect(detectCategoriesFromLegacy({ title: "Юрист по семейному праву" })).toEqual(["legal"]);
    expect(detectCategoriesFromLegacy({ title: "Финансовый консультант" })).toEqual(["finance"]);
  });

  it("infers the esoteric category from a Specialty enum value", () => {
    expect(detectCategoriesFromLegacy({ specialties: ["TAROT"], title: "Таролог" })).toContain("esoteric");
  });

  it("prefers explicit categories over inference", () => {
    expect(
      effectiveCategories({ categories: ["coaching"], specialties: ["TAROT"], title: "Таролог" }),
    ).toEqual(["coaching"]);
    // empty explicit list → fall back to inference
    expect(
      effectiveCategories({ categories: [], specialties: [], title: "Психолог" }),
    ).toEqual(["psychology"]);
  });
});
