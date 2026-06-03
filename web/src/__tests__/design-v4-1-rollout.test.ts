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
    for (const route of ["/products/clarity-practice", "/products/circle", "/products/pair", "/telegram"] as const) {
      expect(publicSeoRoutes).toContain(route);
      expect(publicPageSeo[route].title).toContain("ETerapy");
    }

    const header = source("components/header.tsx");
    const footer = source("components/footer.tsx");

    expect(header).toContain('label: "Продукты"');
    expect(footer).toContain('mainUrl("/products/circle")');
    expect(footer).toContain('mainUrl("/products/pair")');
    expect(footer).toContain('mainUrl("/telegram")');
    expect(footer).toContain('mainUrl("/products/clarity-practice")');
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

    expect(catalog).toContain("Круг ясности");
    expect(catalog).toContain("Разобраться вдвоём");
    expect(catalog).toContain("Практика ясности");
    expect(catalog).toContain("soft-service-card");
    expect(catalog).not.toContain("var(--paper-card)");
    expect(pricing).toContain("490");
    expect(pricing).toContain("Без скидок на встречи");
    // T9: chat-analysis is a single 390 ₽ price (tiers removed until they ship);
    // natal 590, joint от 4 500.
    expect(catalog).toContain("590 ₽");
    expect(catalog).toContain("390 ₽");
    expect(catalog).toContain("от 4 500 ₽");
    expect(products).toContain("один отчёт на двоих");
  });

  it("adds the v4.2 growth loop section to the landing", () => {
    const home = source("app/page.tsx");
    const growth = source("components/landing/growth-formats.tsx");

    expect(home).toContain("<GrowthFormatsSection />");
    expect(growth).toContain("взгляд со стороны");
    expect(growth).toContain("Круг ясности");
    expect(growth).toContain("Разобраться вдвоём");
    expect(growth).toContain("ежедневная практика");
  });

  it("adds the v4.2 esoteric showcase and specialists teaser to the landing", () => {
    const home = source("app/page.tsx");
    const esoteric = source("components/landing/esoteric-showcase.tsx");
    const specialists = source("components/landing/specialists-teaser.tsx");

    expect(home).toContain("<EsotericShowcaseSection />");
    expect(home).toContain("<SpecialistsTeaserSection />");
    expect(esoteric).toContain("эзотерические направления");
    expect(esoteric).toContain("как метафоры");
    expect(esoteric).toContain("/products/tarot");
    expect(esoteric).toContain("/products/natal-chart");
    expect(esoteric).toContain("/products/numerology");
    expect(esoteric).toContain("/products/joint-session");
    expect(specialists).toContain("проверенные специалисты");
    expect(specialists).toContain("живой разговор");
    expect(specialists).toContain('href="/practitioners"');
  });

  it("keeps specialist and cabinet surfaces inside the v4.2 shell", () => {
    const specialists = source("app/practitioners/page.tsx");
    const grid = source("app/practitioners/practitioners-grid.tsx");
    const shell = source("components/cabinet/cabinet-shell.tsx");

    expect(specialists).toContain("София Мирная");
    expect(specialists).toContain("Елена Орлова");
    expect(specialists).toContain("Ника Сокол");
    expect(grid).toContain('data-testid="specialists-empty-state"');
    expect(shell).not.toContain("<BrandSignature compact");
    expect(shell).toContain('data-testid="app-shell-user"');
    expect(shell).toContain("soft-app-sidebar-card");
  });
});
