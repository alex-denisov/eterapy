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

  it("keeps products canonical, direct-orderable, and still connected to the free dialogue", () => {
    const indexPage = source("app/products/page.tsx");
    const detailPage = source("app/products/[slug]/page.tsx");

    expect(indexPage).toContain('data-testid="products-page"');
    expect(indexPage).toContain('href="/checkin"');
    expect(indexPage).toContain("открыть нужную услугу напрямую");
    expect(detailPage).toContain('data-testid="product-dialogue-cta"');
    expect(detailPage).toContain('data-testid="product-my-map-preview"');
    expect(detailPage).toContain('href="/checkin"');
    expect(detailPage).toContain("<ProductPurchaseControls");
    expect(detailPage).toContain('href={product.directHref}');
    expect(source("components/products/product-purchase-controls.tsx")).toContain("/api/billing/pay-from-balance");
    expect(source("lib/v5-products.ts")).toContain('route: "/products/tarot"');
    expect(source("lib/v5-products.ts")).toContain('directHref: "/practitioners?format=joint-session"');
  });

  it("documents required privacy and paid-product mechanics", () => {
    const products = source("lib/v5-products.ts");

    expect(products).toContain("предупреждение о персональных данных");
    expect(products).toContain("удаление источника");
    expect(products).toContain("согласие партнера");
    expect(products).toContain("пауза и продолжение");
    expect(products).toContain("сохранить, скрыть или удалить");
    expect(products).toContain("открытие через entitlement");
    expect(products).toContain("или -4 кредита ясности");
    expect(source("components/products/credit-spend-button.tsx")).toContain("/api/billing/spend-credits");
    expect(source("components/products/product-purchase-controls.tsx")).toContain("/api/billing/spend-credits");
    expect(source("app/api/billing/pay-from-balance/route.ts")).toContain("purchaseProductWithBalance");
  });

  it("adds cabinet-native product and credit catalogues", () => {
    const cabinetProducts = source("app/cabinet/products/page.tsx");
    const credits = source("app/cabinet/credits/page.tsx");
    const shell = source("components/cabinet/cabinet-shell.tsx");

    expect(cabinetProducts).toContain('data-testid="cabinet-products-page"');
    expect(cabinetProducts).toContain("<ProductPurchaseControls");
    expect(cabinetProducts).toContain('appUrl("/cabinet/billing")');
    expect(credits).toContain('data-testid="cabinet-credits-page"');
    expect(credits).toContain("getClarityCreditBalance");
    expect(shell).toContain('appUrl("/cabinet/modalities")');
    expect(shell).toContain('appUrl("/cabinet/credits")');
  });

  it("links public shell product navigation to durable product pages", () => {
    expect(source("components/header.tsx")).toContain('href: "/pricing"');
    expect(source("components/footer.tsx")).toContain('mainUrl("/products")');
  });
});
