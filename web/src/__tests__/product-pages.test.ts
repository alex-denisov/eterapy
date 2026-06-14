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

  it("keeps products canonical, flat, and still connected to the free dialogue", () => {
    const indexPage = source("app/products/page.tsx");
    const detailPage = source("app/products/[slug]/page.tsx");
    const purchaseControls = source("components/products/product-purchase-controls.tsx");
    const productActions = [
      "components/products/deep-report-actions.tsx",
      "components/products/perspectives-actions.tsx",
      "components/products/chat-analysis-actions.tsx",
      "components/products/compatibility-actions.tsx",
      "components/products/symbolic-product-actions.tsx",
      "components/products/synastry-actions.tsx",
    ].map(source).join("\n");

    expect(indexPage).toContain('data-testid="products-page"');
    expect(indexPage).toContain('href="/checkin"');
    expect(indexPage).toContain("открыть нужную услугу напрямую");
    expect(detailPage).toContain('data-testid="product-service-start"');
    expect(detailPage).toContain("<ProductActionSurface");
    expect(detailPage).toContain("<PerspectivesActions");
    expect(detailPage).not.toContain("nextProduct=");
    expect(detailPage).not.toContain("<ProductPurchaseControls");
    expect(productActions).toContain("<ProductPurchaseControls");
    // Z1-Ф1: the ₽ balance rail is gone — products open with credits or card.
    expect(purchaseControls).not.toContain("/api/billing/pay-from-balance");
    expect(purchaseControls).toContain("/api/billing/create-payment");
    expect(source("lib/v5-products.ts")).toContain('route: "/products/tarot"');
    // M26/B367: joint-session removed from the catalog entirely.
    expect(source("lib/v5-products.ts")).not.toContain("joint-session\":");
  });

  it("renders the tool-first product hero (no decorative previews or side panels)", () => {
    const detailPage = source("app/products/[slug]/page.tsx");
    const products = source("lib/v5-products.ts");

    expect(detailPage).toContain('data-testid="product-hero"');
    // B395: tool-first hero — round iOS back arrow + corner ₽ price, the tool
    // on the first screen. The decorative preview and the «← На главную» text
    // chip were removed.
    expect(detailPage).toContain('data-testid="product-hero-back"');
    expect(detailPage).toContain('data-testid="product-hero-price"');
    expect(detailPage).toContain("{product.price}");
    expect(detailPage).not.toContain('data-testid="product-hero-preview"');
    expect(detailPage).not.toContain("← На главную");

    expect(detailPage).toContain('data-testid="product-service-start"');
    expect(detailPage).not.toContain('data-testid="deep-report-sample-main-fork"');
    expect(detailPage).not.toContain('data-testid="product-example-disclosure"');

    // B395: per-product *Side / preview components removed — the hero renders
    // the action component directly (symbolic products via SymbolicProductActions).
    expect(detailPage).not.toContain("<TarotSide");
    expect(detailPage).not.toContain("<NumerologySide");
    expect(detailPage).toContain("<SymbolicProductActions");

    expect(detailPage).not.toContain("joint-session");

    expect(products).toContain("Подробный разбор");
    // Z2 credit-centric: deep-report is a PREMIUM anchor (Plus includes only
    // perspectives), so the copy must say Premium, not Plus.
    expect(products).toContain("или −3 балла · в Premium входит");
    expect(products).not.toContain("в Plus входит");
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

    expect(actions).toContain("/api/products/symbolic");
    expect(actions).toContain("<ProductPurchaseControls");
    // #7: paid purchase auto-generates the full result once unlocked, once the
    // user has typed their context.
    expect(actions).toContain("if (userInput.trim())");
    expect(route).toContain('productKey: "tarot"');
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
    // B373: «пауза и продолжение» и «сохранить, скрыть или удалить» ушли вместе
    // с выпиленными услугами (маршрут и расширенная карта).
    expect(products).toContain("открытие через entitlement");
    expect(products).toContain("или −3 балла");
    expect(source("components/products/credit-spend-button.tsx")).toContain("/api/billing/spend-credits");
    expect(source("components/products/product-purchase-controls.tsx")).toContain("/api/billing/spend-credits");
  });

  it("X11/Y7: the single cabinet funnel lives on /credits; legacy /products is removed (no redirect stub)", () => {
    const credits = source("app/cabinet/wallet/page.tsx");
    const shell = source("components/cabinet/cabinet-shell.tsx");

    // Y7: the duplicate /cabinet/products page is fully removed — not even a
    // redirect stub remains. Old links must point straight at /cabinet/credits.
    expect(fs.existsSync(path.join(srcDir, "app/cabinet/products/page.tsx"))).toBe(false);
    // the product catalog + purchase funnel lives on /credits
    expect(credits).toContain('data-testid="cabinet-wallet-page"');
    expect(credits).toContain("getCreditWalletSnapshot");
    expect(credits).toContain("<ProductPurchaseControls");
    expect(credits).toContain('id="credits-products"');
    expect(source("components/products/product-purchase-controls.tsx")).toContain('variant?: "default" | "catalog"');
    // nav points to the single funnel page
    expect(shell).toContain('appUrl("/wallet")');
  });

  it("links public shell product navigation to durable product pages", () => {
    expect(source("components/header.tsx")).toContain('href: "/pricing"');
    expect(source("components/footer.tsx")).toContain('mainUrl("/products")');
  });
});
