import fs from "node:fs";
import path from "node:path";
import {
  PAIR_READING_PARAM,
  readingIdFromSearch,
  withReadingParam,
  withoutReadingParam,
  findReadingById,
} from "@/lib/pair-hub";

const root = path.join(__dirname, "..", "..");
function source(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("B465 — pair session helpers (?reading=)", () => {
  it("reads the pinned reading id from a search string or URLSearchParams", () => {
    expect(readingIdFromSearch("?reading=abc123")).toBe("abc123");
    expect(readingIdFromSearch("reading=abc123&scenario=compare")).toBe("abc123");
    expect(readingIdFromSearch(new URLSearchParams("reading=xyz"))).toBe("xyz");
    expect(readingIdFromSearch("?scenario=compare")).toBeNull();
    expect(readingIdFromSearch("?reading=")).toBeNull();
    expect(readingIdFromSearch("?reading=%20%20")).toBeNull();
  });

  it("pins reading=<id> while preserving other params", () => {
    expect(withReadingParam("/products/pair", "?scenario=compare", "r1")).toBe(
      "/products/pair?scenario=compare&reading=r1",
    );
    expect(withReadingParam("/products/pair", "", "r1")).toBe("/products/pair?reading=r1");
    // Replaces an existing reading rather than duplicating it.
    expect(withReadingParam("/products/pair", "?reading=old", "new")).toBe(
      "/products/pair?reading=new",
    );
  });

  it("removes reading=<id> for a fresh session, keeping the rest", () => {
    expect(withoutReadingParam("/products/pair", "?scenario=compare&reading=r1")).toBe(
      "/products/pair?scenario=compare",
    );
    expect(withoutReadingParam("/products/pair", "?reading=r1")).toBe("/products/pair");
  });

  it("restores the right session by id (and only when an id is given)", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(findReadingById(list, "b")).toEqual({ id: "b" });
    expect(findReadingById(list, "z")).toBeNull();
    expect(findReadingById(list, null)).toBeNull();
    expect(findReadingById(null, "a")).toBeNull();
  });

  it("uses the shared `reading` param name", () => {
    expect(PAIR_READING_PARAM).toBe("reading");
  });
});

describe("B465 — pair scenarios wire ?reading= session pinning", () => {
  const together = source("src/components/products/together-actions.tsx");
  const compatibility = source("src/components/products/compatibility-actions.tsx");

  it("both scenarios import and use the reading-session helpers", () => {
    for (const src of [together, compatibility]) {
      expect(src).toMatch(/readingIdFromSearch|withReadingParam/);
      expect(src).toContain("history.replaceState");
    }
  });

  it("circle scenario restores a specific reading by id", () => {
    expect(together).toContain("findReadingById");
  });

  it("compatibility scenario restores via the by-id endpoint", () => {
    expect(compatibility).toMatch(/compatibility\/\$\{[^}]*\}/);
  });

  it("adds a GET-by-id handler for compatibility restore", () => {
    const route = source("src/app/api/products/compatibility/[id]/route.ts");
    expect(route).toContain("export async function GET");
  });

  it("B488 treats pair compare ?reading= links as the logged-in client's invite entry", () => {
    const route = source("src/app/api/products/compatibility/[id]/route.ts");
    const partnerRoute = source("src/app/api/products/compatibility/[id]/partner-part/route.ts");

    expect(compatibility).toContain("asInvite=1");
    expect(compatibility).toContain('viewerRole?: "creator" | "partner" | "invitee"');
    expect(compatibility).toContain("result.viewerRole === \"invitee\"");
    expect(compatibility).toContain("viaReading");
    expect(route).toContain('request.nextUrl.searchParams.get("asInvite") === "1"');
    expect(route).toContain(': "invitee"');
    expect(partnerRoute).toContain('viewerRole: "partner"');
    expect(partnerRoute).toContain("viaReading");
  });
});

describe("B465 — product input font unified up to product-question-input (no 14px)", () => {
  const pairInputs = [
    "src/components/products/pair-self-view-intake.tsx",
    "src/components/products/together-actions.tsx",
    "src/components/products/compatibility-actions.tsx",
    "src/components/products/product-intake.tsx",
  ];

  it("removes the tiny 14px (text-sm) override from every product input class", () => {
    for (const rel of pairInputs) {
      const src = source(rel);
      // soft-question-input must never be paired with the 14px text-sm shrink — that
      // is exactly the «слишком мелкий» complaint. Single-line inputs may use text-base.
      expect(src).not.toMatch(/soft-question-input[^"'`]*\btext-sm\b/);
    }
  });

  it("pair + product-intake textareas adopt the product-question-input size", () => {
    for (const rel of [
      "src/components/products/pair-self-view-intake.tsx",
      "src/components/products/product-intake.tsx",
      "src/components/products/together-actions.tsx",
    ]) {
      expect(source(rel)).toContain("product-question-input");
    }
  });
});
