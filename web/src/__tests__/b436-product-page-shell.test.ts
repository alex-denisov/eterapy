import fs from "node:fs";
import path from "node:path";
import { getProductPageSpec, PRODUCT_PAGE_FAMILY_SPECS } from "@/lib/product-page-redesign";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B436 product page redesign shell", () => {
  it("documents the three redesign families with benchmark-backed above-the-fold rules", () => {
    expect(Object.keys(PRODUCT_PAGE_FAMILY_SPECS).sort()).toEqual(["relationship", "symbolic", "synthesis"]);

    expect(getProductPageSpec("natal-chart")).toMatchObject({
      family: "symbolic",
      heroVisual: "interactive-chart",
    });
    expect(getProductPageSpec("compatibility")).toMatchObject({ family: "relationship" });
    expect(getProductPageSpec("deep-report")).toMatchObject({ family: "synthesis" });

    for (const spec of Object.values(PRODUCT_PAGE_FAMILY_SPECS)) {
      expect(spec.aboveFoldRule).toContain("цена");
      expect(spec.aboveFoldRule).toContain("primary CTA");
      expect(spec.benchmarkPattern.length).toBeGreaterThan(20);
    }
  });

  it("keeps the ProductPageShell for not-yet-reworked pages while chat-analysis is restored to the compact hero", () => {
    const route = source("src/app/products/[slug]/page.tsx");
    const shell = source("src/components/products/product-page-shell.tsx");
    const css = source("src/app/v4-soft.css");

    // B436 shell still serves products not yet reworked page-by-page…
    expect(route).toContain("<ProductPageShell");
    expect(route).toContain("<ProductActionSurface");
    // …but the compact tool-first hero (B395) is restored and chat-analysis is
    // routed back through it — the generic B436 shell regressed that page.
    expect(route).toContain("function ProductHero");
    expect(route).toContain("COMPACT_HERO_SLUGS");
    expect(route).toContain('"chat-analysis"');

    expect(shell).toContain('data-testid="product-page-shell"');
    expect(shell).toContain('data-testid="product-above-fold"');
    expect(shell).toContain('data-testid="product-primary-cta"');
    expect(shell).toContain('data-testid="product-hero-preview"');
    expect(shell).toContain('data-testid="product-family-spec"');
    expect(shell).toContain("<ProductHeroPrice");
    expect(css).toContain(".soft-product-detail-page .soft-button-primary");
    expect(css).toContain("background: #9d4635");
  });

  it("uses natal-chart as the B436 prototype with a real chart preview above the fold", () => {
    const shell = source("src/components/products/product-page-shell.tsx");

    expect(shell).toContain("buildNatalWheel");
    expect(shell).toContain("<ZodiacWheel");
    expect(shell).toContain('product.slug === "natal-chart"');
    expect(shell).toContain("Подписки и купленные баллы");
  });
});
