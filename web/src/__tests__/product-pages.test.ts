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
    expect(detailPage).toContain("creditCost={product.creditCost}");
    expect(source("components/products/product-purchase-controls.tsx")).toContain("/api/billing/pay-from-balance");
    expect(source("lib/v5-products.ts")).toContain('route: "/products/tarot"');
    expect(source("lib/v5-products.ts")).toContain('directHref: "/practitioners?format=joint-session"');
  });

  it("ports v4.2 product hero and page-specific blocks instead of a generic product template", () => {
    const detailPage = source("app/products/[slug]/page.tsx");
    const products = source("lib/v5-products.ts");

    expect(detailPage).toContain('data-testid="product-hero"');
    expect(detailPage).toContain('data-testid="product-hero-preview"');
    expect(detailPage).toContain("← На главную");
    expect(detailPage).toContain("product.priceMeta");

    expect(detailPage).toContain("ETerapy · глубокий отчёт");
    expect(detailPage).toContain('data-testid="deep-report-sample-main-fork"');
    expect(detailPage).toContain("03 · Карта факт-чувство-предположение");
    expect(detailPage).toContain("Если хочется");

    expect(detailPage).toContain('data-testid="extended-map-central-story"');
    expect(detailPage).toContain("3 темы стали тише за год, 1 — окрепла");

    expect(detailPage).toContain('data-testid="tarot-live-example"');
    expect(detailPage).toContain("Раскрыть карты");
    expect(detailPage).toContain("интерпретация · фрагмент");

    expect(detailPage).toContain('data-testid="natal-birth-data"');
    expect(detailPage).toContain("акцент года");

    expect(detailPage).toContain('data-testid="numerology-number-cards"');
    expect(detailPage).toContain("что с этим делать");

    expect(detailPage).toContain('data-testid="joint-session-timeline"');
    expect(detailPage).toContain("структура встречи");

    expect(products).toContain("Глубокий отчёт");
    expect(products).toContain("или −4 кредита ясности · в Plus входит");
    expect(products).toContain("один отчёт на двоих");
  });

  it("keeps paid symbolic and map products usable after purchase", () => {
    const detailPage = source("app/products/[slug]/page.tsx");
    const actions = source("components/products/symbolic-product-actions.tsx");
    const route = source("app/api/products/symbolic/route.ts");

    expect(detailPage).toContain("<SymbolicProductActions");
    expect(detailPage).toContain('product.slug === "tarot"');
    expect(detailPage).toContain('product.slug === "natal-chart"');
    expect(detailPage).toContain('product.slug === "numerology"');
    expect(detailPage).toContain('product.slug === "my-map"');

    expect(actions).toContain("/api/products/symbolic");
    expect(actions).toContain("<ProductPurchaseControls");
    expect(actions).toContain("if (userInput.trim())");
    expect(route).toContain('productKey: "tarot"');
    expect(route).toContain('productKey: "my-map"');
    expect(route).toContain("userHasActiveEntitlement");
    expect(route).toContain("Не авторизован");
  });

  it("documents required privacy and paid-product mechanics", () => {
    const products = source("lib/v5-products.ts");

    // B330: chat-analysis lost the "предупреждение о персональных данных"
    // mechanic copy when the misleading consent checkbox was removed. The
    // remaining privacy primitives (delete source, partner consent for
    // compatibility) are still required.
    expect(products).toContain("удаление источника");
    expect(products).toContain("согласие партнёра");
    expect(products).toContain("пауза и продолжение");
    expect(products).toContain("сохранить, скрыть или удалить");
    expect(products).toContain("открытие через entitlement");
    expect(products).toContain("или −4 кредита ясности");
    expect(source("components/products/credit-spend-button.tsx")).toContain("/api/billing/spend-credits");
    expect(source("components/products/product-purchase-controls.tsx")).toContain("/api/billing/spend-credits");
    expect(source("app/api/billing/pay-from-balance/route.ts")).toContain("purchaseProductWithBalance");
  });

  it("X11: the single cabinet funnel lives on /credits; /products redirects to it", () => {
    const cabinetProducts = source("app/cabinet/products/page.tsx");
    const credits = source("app/cabinet/credits/page.tsx");
    const shell = source("components/cabinet/cabinet-shell.tsx");

    // /cabinet/products is now a redirect to /cabinet/credits (no duplicate catalog)
    expect(cabinetProducts).toContain('redirect("/cabinet/credits")');
    expect(cabinetProducts).not.toContain("<ProductPurchaseControls");
    // the product catalog + purchase funnel lives on /credits
    expect(credits).toContain('data-testid="cabinet-credits-page"');
    expect(credits).toContain("getClarityCreditBalance");
    expect(credits).toContain("<ProductPurchaseControls");
    expect(credits).toContain('id="credits-products"');
    expect(source("components/products/product-purchase-controls.tsx")).toContain('variant?: "default" | "catalog"');
    // nav points to the single funnel page
    expect(shell).toContain('appUrl("/credits")');
  });

  it("links public shell product navigation to durable product pages", () => {
    expect(source("components/header.tsx")).toContain('href: "/pricing"');
    expect(source("components/footer.tsx")).toContain('mainUrl("/products")');
  });
});
