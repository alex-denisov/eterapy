import fs from "node:fs";
import path from "node:path";
import { v5Products } from "@/lib/v5-products";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Z8 product-local dialogue intake", () => {
  it("removes the old checkin nextProduct handoff", () => {
    const checkin = source("src/app/checkin/page.tsx");
    const productPage = source("src/app/products/[slug]/page.tsx");
    const productActions = [
      "src/components/products/deep-report-actions.tsx",
      "src/components/products/perspectives-actions.tsx",
      "src/components/products/compatibility-actions.tsx",
      "src/components/products/seven-days-actions.tsx",
    ].map(source).join("\n");

    expect(checkin).not.toContain("nextProduct");
    expect(checkin).not.toContain("dialogue_handoff_to_product");
    expect(productPage).not.toContain("nextProduct=");
    expect(productActions).not.toContain("nextProduct=");
  });

  it("uses ProductIntake for dialogue-backed products with the right modes", () => {
    const intake = source("src/components/products/product-intake.tsx");
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const deepReport = source("src/components/products/deep-report-actions.tsx");
    const perspectives = source("src/components/products/perspectives-actions.tsx");
    const compatibility = source("src/components/products/compatibility-actions.tsx");
    const sevenDays = source("src/components/products/seven-days-actions.tsx");

    expect(intake).toContain('testId = "product-intake"');
    expect(intake).toContain("intakeProductKey");
    expect(intake).toContain("intakeMode");
    expect(intake).toContain("router.replace");

    expect(detailPage).toContain("<ProductActionSurface");
    expect(detailPage).toContain("<PerspectivesActions");
    expect(detailPage).toContain('data-testid="product-service-start"');
    expect(deepReport).toContain("<ProductIntake");
    expect(deepReport).toContain('productKey="deep-report"');
    expect(deepReport).toContain('mode="full"');
    expect(perspectives).toContain("<ProductIntake");
    expect(perspectives).toContain('productKey="perspectives"');
    expect(perspectives).toContain('mode="full"');
    expect(sevenDays).toContain("<ProductIntake");
    expect(sevenDays).toContain('productKey="seven-days"');
    expect(sevenDays).toContain('mode="full"');
    expect(compatibility).toContain('mode="light"');
    expect(compatibility).toContain('productKey={productKey}');
  });

  it("keeps pair and circle direct entry on their product surfaces", () => {
    const products = source("src/lib/v5-products.ts");
    const pairPage = source("src/app/products/pair/page.tsx");
    const circlePage = source("src/app/products/circle/page.tsx");

    expect(v5Products.find((product) => product.slug === "pair")?.directHref).toBe("/products/pair");
    expect(v5Products.find((product) => product.slug === "circle")?.directHref).toBe("/products/circle");
    expect(products).not.toContain('directHref: "/checkin?entry=pair"');
    expect(products).not.toContain('directHref: "/checkin?entry=circle"');
    expect(pairPage).not.toContain("/checkin?entry=pair");
    expect(circlePage).not.toContain("/checkin?entry=circle");
  });
});
