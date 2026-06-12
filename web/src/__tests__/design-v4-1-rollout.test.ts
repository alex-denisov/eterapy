import fs from "node:fs";
import path from "node:path";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";

const srcRoot = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), "utf8");
}

describe("design v4.2 rollout", () => {
  it("exposes the v4.2 growth routes in SEO and public navigation", () => {
    for (const route of ["/products/clarity-practice", "/products/pair", "/telegram"] as const) {
      expect(publicSeoRoutes).toContain(route);
      expect(publicPageSeo[route].title).toContain("ETerapy");
    }

    const header = source("components/header.tsx");
    const footer = source("components/footer.tsx");

    expect(header).toContain('label: "Продукты"');
    // B380 (M26): the footer was condensed to the catalogue groups and no longer
    // links the soon-to-be-removed growth routes (circle / clarity-practice /
    // telegram). The «Вместе» entry (→ /products/pair) stays. The routes still
    // exist in SEO until B373 retires them.
    expect(footer).toContain('mainUrl("/products/pair")');
    expect(footer).not.toContain('mainUrl("/products/circle")');
    expect(footer).not.toContain('mainUrl("/products/clarity-practice")');
  });

  it("keeps the v4.2 logo as the only active app icon shape", () => {
    const appIcon = source("app/icon.svg");
    const publicIcon = fs.readFileSync(path.join(process.cwd(), "public/icon.svg"), "utf8");

    expect(appIcon).toContain('viewBox="0 0 120 120"');
    expect(publicIcon).toContain('viewBox="0 0 120 120"');
    expect(appIcon).not.toContain("<path");
    expect(publicIcon).not.toContain("<path");
  });

  it("aligns service cards and prices with the v4.2 product economics", () => {
    const catalog = source("components/products/service-catalog.tsx");
    const pricing = source("app/pricing/pricing-plans.tsx");
    const products = source("lib/v5-products.ts");

    // M26/B370: каталог = 5 групп; «Вместе» — одна карточка, практик-карточек нет.
    expect(catalog).toContain("Начать бесплатно");
    expect(catalog).toContain("Самостоятельные разборы");
    expect(catalog).toContain("Вместе");
    expect(catalog).toContain("Эзотерика");
    expect(catalog).toContain("Поговорить со специалистом");
    expect(catalog).toContain("soft-service-card");
    expect(catalog).not.toContain("var(--paper-card)");
    expect(pricing).toContain("490");
    expect(pricing).toContain("Без скидок на встречи");
    // B366: catalog prices derive from the single billing source (no ₽ literals);
    // the live-встреча card uses the single session floor helper.
    expect(catalog).toContain("getProductPriceLabel");
    expect(catalog).toContain("formatSessionFloor");
    expect(products).toContain("один отчёт на двоих");
  });

  // B374: the v4.2 growth-loop, esoteric-showcase and specialists-teaser
  // sections were removed from the landing to keep it ≤6 mobile screens
  // (growth-formats.tsx / esoteric-showcase.tsx deleted). Their routing now
  // lives in the three scenario-routers + /products + /practitioners.
  it("keeps the landing lean — no growth/esoteric/specialists/trust blocks", () => {
    const home = source("app/page.tsx");

    expect(home).not.toContain("GrowthFormatsSection");
    expect(home).not.toContain("EsotericShowcaseSection");
    expect(home).not.toContain("SpecialistsTeaserSection");
    expect(home).not.toContain("TrustPromisesSection");
    expect(home).not.toContain("TrustPrivacySection");
    // One social-proof block (library) remains; privacy is reassured inline.
    expect(home).toContain("<LibraryPreviewSection />");
  });

  it("keeps specialist and cabinet surfaces inside the v4.2 shell", () => {
    const specialists = source("app/practitioners/page.tsx");
    const grid = source("app/practitioners/practitioners-grid.tsx");
    const shell = source("components/cabinet/cabinet-shell.tsx");

    // B346/Интерфейс 8-9: the catalog is purely DB-backed — no hardcoded demo
    // personas. The grid's empty-state handles the no-data case.
    expect(specialists).not.toContain("София Мирная");
    expect(specialists).toContain("getPractitioners");
    expect(grid).toContain('data-testid="specialists-empty-state"');
    expect(shell).not.toContain("<BrandSignature compact");
    expect(shell).toContain('data-testid="app-shell-user"');
    expect(shell).toContain("soft-app-sidebar-card");
  });
});
