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
    const catalog = source("components/products/service-catalog.tsx");
    const detailPage = source("app/products/[slug]/page.tsx");
    const shell = source("components/products/product-page-shell.tsx");
    const purchaseControls = source("components/products/product-purchase-controls.tsx");
    const productActions = [
      "components/products/deep-report-actions.tsx",
      "components/products/reframe-actions.tsx",
      "components/products/chat-analysis-actions.tsx",
      "components/products/compatibility-actions.tsx",
      "components/products/symbolic-product-actions.tsx",
      "components/products/synastry-actions.tsx",
    ].map(source).join("\n");

    expect(indexPage).toContain('data-testid="products-page"');
    // B456: the free dialogue link now lives on the catalog's slim entry row.
    expect(catalog).toContain("/checkin");
    expect(indexPage).toContain("выберите то, что подходит сейчас");
    expect(shell).toContain('data-testid="product-service-start"');
    expect(detailPage).toContain("<ProductActionSurface");
    expect(detailPage).toContain("<ReframeActions");
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

  it("renders the product shell with first-screen value, CTA, and preview", () => {
    const detailPage = source("app/products/[slug]/page.tsx");
    const shell = source("components/products/product-page-shell.tsx");
    const priceChip = source("components/products/product-hero-price.tsx");
    const products = source("lib/v5-products.ts");

    expect(detailPage).toContain("<ProductPageShell");
    expect(shell).toContain('data-testid="product-page-shell"');
    expect(shell).toContain('data-testid="product-above-fold"');
    expect(shell).toContain('data-testid="product-primary-cta"');
    expect(shell).toContain('data-testid="product-hero-preview"');
    expect(shell).toContain('data-testid="product-hero-back"');
    expect(detailPage).not.toContain("function ProductToolGuide");
    expect(detailPage).not.toContain('data-testid="product-tool-guide"');
    // B405: the price chip is a role-aware client component (guest ₽ / authed баллы).
    expect(shell).toContain("<ProductHeroPrice");
    expect(priceChip).toContain('data-testid="product-hero-price"');
    expect(priceChip).toContain("{product.price}");
    expect(detailPage).not.toContain("← На главную");

    expect(detailPage).not.toContain('data-testid="deep-report-sample-main-fork"');
    expect(detailPage).not.toContain('data-testid="product-example-disclosure"');

    // B395: per-product *Side components removed — the shell renders the action
    // component directly (symbolic products via SymbolicProductActions).
    expect(detailPage).not.toContain("<TarotSide");
    expect(detailPage).not.toContain("<NumerologySide");
    expect(detailPage).toContain("<SymbolicProductActions");

    expect(detailPage).not.toContain("joint-session");

    expect(products).toContain("Подробный разбор");
    // Z2 credit-centric: deep-report is a PREMIUM anchor (Plus includes only
    // reframe), so the copy must say Premium, not Plus.
    expect(products).toContain("или −3 балла · в Premium входит");
    expect(products).not.toContain("в Plus входит");
    // B463: разбор отношений живёт в сценарии «Сверить взгляды» («Ваша связь»)
    // внутри «Вместе», не отдельной услугой «Совместимость».
    expect(products).toContain("про ваши отношения в целом");
  });

  it("B405 shows guests ₽ and authenticated users баллы-first on the product hero price", () => {
    const priceChip = source("components/products/product-hero-price.tsx");

    // role-aware: reads the session
    expect(priceChip).toContain("useSession");
    expect(priceChip).toContain('status === "authenticated"');
    // authed → баллы primary (from the catalogue creditCost) + small ₽ secondary
    expect(priceChip).toContain("formatPoints");
    expect(priceChip).toContain("product.creditCost");
    expect(priceChip).toContain("или {product.price}");
    // guest → ₽ only (the default branch renders the plain price)
    expect(priceChip).toContain("{product.price}");
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
    expect(actions).toContain('data-testid="tarot-product-actions"');
    expect(actions).toContain('data-testid="tarot-deck-preview"');
    expect(actions).toContain('data-testid="tarot-reveal"');
    expect(actions).toContain("TAROT_SPREAD_OPTIONS");
    expect(actions).toContain("tarotTheme");
    expect(actions).toContain("tarotSpread");
    expect(actions).not.toContain('data-testid="symbolic-free-fragment-tarot"');
    // #7: paid purchase auto-generates the full result once unlocked, once the
    // user has typed their context.
    expect(actions).toContain("if (userInput.trim())");
    expect(route).toContain('productKey: "tarot"');
    expect(route).toContain("tarotSpread");
    expect(route).toContain("tarotTheme");
    expect(route).toContain("userHasActiveEntitlement");
    expect(route).toContain("Не авторизован");
  });

  it("documents required privacy and paid-product mechanics", () => {
    const products = source("lib/v5-products.ts");

    // B330: chat-analysis lost the "предупреждение о персональных данных"
    // mechanic copy when the misleading consent checkbox was removed. The
    // remaining privacy primitives (delete source, partner consent for
    // «Вместе») are still required. («Совместимость» как отдельная услуга снята —
    // совместимость теперь сценарий внутри «Вместе» с согласием участников.)
    expect(products).toContain("удаление источника");
    expect(products).toContain("согласие участников");
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
    // B464 IB0: the landing nav lives in the shared nav-model.
    expect(source("lib/nav-model.ts")).toContain('href: "/pricing"');
    expect(source("components/footer.tsx")).toContain('mainUrl("/products")');
  });
});
