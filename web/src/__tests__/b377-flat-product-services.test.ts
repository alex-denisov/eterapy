import fs from "node:fs";
import path from "node:path";
import { v5Products } from "@/lib/v5-products";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B377 flat product service pages", () => {
  it("starts generic product pages with the service action, not purchase or examples", () => {
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const hero = detailPage.split("function ProductHero")[1]?.split("function DeepReportSide")[0] ?? "";
    const renderOrder = detailPage.split("export default async function ProductPage")[1] ?? "";

    expect(hero).not.toContain("<ProductPurchaseControls");
    expect(detailPage).not.toContain("product-example-disclosure");
    expect(detailPage).not.toContain("data-testid=\"deep-report-sample");
    expect(detailPage).not.toMatch(/пример\s*[·<]/i);

    expect(renderOrder.indexOf("<ProductHero")).toBeLessThan(renderOrder.indexOf("<ProductActionSurface"));
    expect(renderOrder.indexOf("<ProductActionSurface")).toBeGreaterThan(-1);
    expect(renderOrder.indexOf("<ProductActionSurface")).toBeLessThan(renderOrder.indexOf("<ProductFooter"));
  });

  it("keeps paid copy as flat service starts instead of buy buttons", () => {
    const products = source("src/lib/v5-products.ts");
    const buyPattern = /directCta:\s*"Купить/;

    expect(products).not.toMatch(buyPattern);
    for (const product of v5Products) {
      expect(product.directCta ?? "").not.toMatch(/^Купить/);
    }
  });

  it("keeps payment controls behind product action surfaces", () => {
    const productPage = source("src/app/products/[slug]/page.tsx");
    const actionFiles = [
      "src/components/products/deep-report-actions.tsx",
      "src/components/products/perspectives-actions.tsx",
      "src/components/products/chat-analysis-actions.tsx",
      "src/components/products/compatibility-actions.tsx",
      "src/components/products/seven-days-actions.tsx",
      "src/components/products/symbolic-product-actions.tsx",
      "src/components/products/synastry-actions.tsx",
    ];

    expect(productPage).toContain("<ProductActionSurface");
    for (const file of actionFiles) {
      const contents = source(file);
      const firstInput = Math.min(
        ...["<ProductIntake", "<textarea", "<input"].map((token) => {
          const index = contents.indexOf(token);
          return index === -1 ? Number.POSITIVE_INFINITY : index;
        }),
      );

      expect(contents).toContain("<ProductPurchaseControls");
      expect(firstInput).toBeLessThan(Number.POSITIVE_INFINITY);
      expect(contents.indexOf("<ProductPurchaseControls")).toBeGreaterThan(firstInput);
    }
  });
});
