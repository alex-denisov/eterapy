import {
  PRACTITIONER_TABS,
  DEFAULT_PRACTITIONER_TAB,
  tabCategories,
  firstNonEmptyTab,
  resolveInitialTab,
} from "@/lib/practitioner-tabs";

describe("B457 practitioner tabs / smart-default", () => {
  it("keeps the three canonical tabs with psy-coach as the declared default", () => {
    expect(PRACTITIONER_TABS.map((t) => t.id)).toEqual(["psy-coach", "esoteric", "all"]);
    expect(DEFAULT_PRACTITIONER_TAB).toBe("psy-coach");
  });

  it("expands legacy joint category into psychology + esoteric", () => {
    const cats = tabCategories({ categories: ["joint"] });
    expect(cats).toContain("psychology");
    expect(cats).toContain("esoteric");
    expect(cats).not.toContain("joint");
  });

  it("falls back to the first non-empty tab when the default is empty", () => {
    // catalog with only esoteric specialists → psy-coach is empty → show esoteric
    const allCats = [["esoteric"], ["esoteric"]];
    expect(firstNonEmptyTab(allCats)).toBe("esoteric");
  });

  it("prefers psy-coach when it has any specialist", () => {
    const allCats = [["esoteric"], ["psychology"], ["coaching"]];
    expect(firstNonEmptyTab(allCats)).toBe("psy-coach");
  });

  it("falls back to 'all' when only non-psy/non-esoteric specialists exist", () => {
    expect(firstNonEmptyTab([["legal"], ["finance"]])).toBe("all");
  });

  it("returns the declared default for an empty catalog", () => {
    expect(firstNonEmptyTab([])).toBe(DEFAULT_PRACTITIONER_TAB);
  });

  it("resolveInitialTab honours an explicit ?format= over the smart-default", () => {
    const allCats = [["psychology"]];
    // tarot deep-link wins even though psychology is populated
    expect(resolveInitialTab(allCats, "tarot")).toBe("esoteric");
    expect(resolveInitialTab(allCats, "psychology")).toBe("psy-coach");
    // unknown format → smart-default
    expect(resolveInitialTab([["esoteric"]], "bogus")).toBe("esoteric");
    expect(resolveInitialTab([["esoteric"]], null)).toBe("esoteric");
  });
});
