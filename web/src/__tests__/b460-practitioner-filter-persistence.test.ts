import {
  resolveInitialTab,
  isPractitionerTabId,
  tabQueryString,
  listHrefFromReferrer,
} from "@/lib/practitioner-tabs";

// B460 (item 16): selecting a catalog tab → opening a profile → pressing back
// reset the filter to the smart-default. The grid now pins the chosen tab into
// the URL (`?tab=`) so a browser back / shareable reload restores it, and the
// profile back-arrow returns to the filtered list. These pure helpers back that.

describe("B460 — /practitioners filter survives the profile round-trip", () => {
  describe("isPractitionerTabId", () => {
    it("accepts the three canonical tab ids", () => {
      expect(isPractitionerTabId("psy-coach")).toBe(true);
      expect(isPractitionerTabId("esoteric")).toBe(true);
      expect(isPractitionerTabId("all")).toBe(true);
    });

    it("rejects anything else, including null/undefined/empty", () => {
      expect(isPractitionerTabId("bogus")).toBe(false);
      expect(isPractitionerTabId(null)).toBe(false);
      expect(isPractitionerTabId(undefined)).toBe(false);
      expect(isPractitionerTabId("")).toBe(false);
    });
  });

  describe("resolveInitialTab honours an explicit ?tab=", () => {
    it("an explicit ?tab= wins over ?format= and the smart-default", () => {
      // psychology is populated (smart-default = psy-coach) and format=tarot would
      // map to esoteric — but the user's last catalog choice (tab=all) wins.
      expect(resolveInitialTab([["psychology"]], "tarot", "all")).toBe("all");
      expect(resolveInitialTab([["psychology"]], null, "esoteric")).toBe("esoteric");
    });

    it("an invalid ?tab= is ignored (falls back to format / smart-default)", () => {
      expect(resolveInitialTab([["psychology"]], "tarot", "bogus")).toBe("esoteric");
      expect(resolveInitialTab([["esoteric"]], null, "")).toBe("esoteric");
    });

    it("no ?tab= keeps the existing format / smart-default behaviour", () => {
      expect(resolveInitialTab([["psychology"]], null)).toBe("psy-coach");
      expect(resolveInitialTab([["psychology"]], "tarot")).toBe("esoteric");
    });
  });

  describe("tabQueryString — the URL the grid pins when a tab is picked", () => {
    it("sets ?tab= and drops the inbound-only ?format= hint", () => {
      expect(tabQueryString("?format=tarot", "esoteric")).toBe("tab=esoteric");
    });

    it("preserves unrelated params (e.g. sort)", () => {
      const params = new URLSearchParams(tabQueryString("?sort=price", "all"));
      expect(params.get("sort")).toBe("price");
      expect(params.get("tab")).toBe("all");
    });

    it("works from an empty search string", () => {
      expect(tabQueryString("", "psy-coach")).toBe("tab=psy-coach");
    });

    it("overwrites a stale ?tab=", () => {
      expect(tabQueryString("?tab=psy-coach", "esoteric")).toBe("tab=esoteric");
    });
  });

  describe("listHrefFromReferrer — the profile back-arrow keeps the filter", () => {
    const ORIGIN = "https://eterapy.com";

    it("returns the relative catalog URL (with its filter) for a same-origin /practitioners referrer", () => {
      expect(listHrefFromReferrer("https://eterapy.com/practitioners?tab=esoteric", ORIGIN)).toBe(
        "/practitioners?tab=esoteric",
      );
    });

    it("returns the bare path when the catalog had no filter", () => {
      expect(listHrefFromReferrer("https://eterapy.com/practitioners", ORIGIN)).toBe("/practitioners");
    });

    it("ignores a referrer from a different path", () => {
      expect(listHrefFromReferrer("https://eterapy.com/products", ORIGIN)).toBeNull();
    });

    it("ignores a cross-origin referrer", () => {
      expect(listHrefFromReferrer("https://evil.com/practitioners?tab=all", ORIGIN)).toBeNull();
    });

    it("ignores an empty or malformed referrer", () => {
      expect(listHrefFromReferrer("", ORIGIN)).toBeNull();
      expect(listHrefFromReferrer("not a url", ORIGIN)).toBeNull();
    });
  });
});
