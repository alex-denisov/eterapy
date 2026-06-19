import fs from "node:fs";
import path from "node:path";
import { getProductPageSpec } from "@/lib/product-page-redesign";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B437 symbolic product hero previews", () => {
  const symbolicSlugs = [
    "tarot",
    "natal-chart",
    "numerology",
    "human-design",
    "surname-story",
    "family-scenarios",
  ] as const;

  it("keeps every symbolic product on the B436 shell family contract", () => {
    for (const slug of symbolicSlugs) {
      expect(getProductPageSpec(slug).family).toBe("symbolic");
    }
  });

  it("renders a distinct above-the-fold preview for each symbolic service", () => {
    const shell = source("src/components/products/product-page-shell.tsx");

    expect(shell).toContain("<TarotSpreadCards");
    expect(shell).toContain("<ZodiacWheel");
    expect(shell).toContain("<HumanDesignBodygraph");

    for (const testId of [
      "product-tarot-preview",
      "product-natal-preview",
      "product-numerology-preview",
      "product-human-design-preview",
      "product-surname-preview",
      "product-family-preview",
    ]) {
      expect(shell).toContain(`data-testid="${testId}"`);
    }
  });

  it("locks the symbolic previews to generated/static-safe data, not external assets", () => {
    const shell = source("src/components/products/product-page-shell.tsx");

    expect(shell).toContain("drawTarotSpread");
    expect(shell).toContain("computeHumanDesign");
    expect(shell).not.toContain("https://");
    expect(shell).not.toContain("<img");
  });
});
