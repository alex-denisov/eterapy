import fs from "node:fs";
import path from "node:path";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";
import { v5Products } from "@/lib/v5-products";

const srcDir = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcDir, relativePath), "utf8");
}

describe("v5 product pages", () => {
  it("exposes every v5 product as a public SEO route", () => {
    expect(publicSeoRoutes).toContain("/products");

    for (const product of v5Products) {
      expect(publicSeoRoutes).toContain(product.route);
      expect(publicPageSeo[product.route].title).toContain("ETerapy");
      expect(product.summary.length).toBeGreaterThan(40);
      expect(product.mechanics.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps products question-first and out of the marketplace-first path", () => {
    const indexPage = source("app/products/page.tsx");
    const detailPage = source("app/products/[slug]/page.tsx");

    expect(indexPage).toContain('data-testid="products-page"');
    expect(indexPage).toContain('href="/all-modalities/checkin"');
    expect(detailPage).toContain('data-testid="product-dialogue-cta"');
    expect(detailPage).toContain('href="/all-modalities/checkin"');
    expect(indexPage).not.toContain('href="/practitioners"');
    expect(detailPage).not.toContain('href="/practitioners"');
  });

  it("documents required privacy and paid-product mechanics", () => {
    const products = source("lib/v5-products.ts");

    expect(products).toContain("PII warning");
    expect(products).toContain("source deletion");
    expect(products).toContain("partner consent");
    expect(products).toContain("pause/resume");
    expect(products).toContain("save/hide/delete");
    expect(products).toContain("entitlement unlock");
  });

  it("links public shell product navigation to durable product pages", () => {
    expect(source("components/header.tsx")).toContain('href: "/products"');
    expect(source("components/footer.tsx")).toContain('href="/products"');
  });
});
