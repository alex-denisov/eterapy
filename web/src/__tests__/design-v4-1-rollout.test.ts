import fs from "node:fs";
import path from "node:path";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";

const srcRoot = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), "utf8");
}

describe("design v4.1 rollout", () => {
  it("exposes the v4.1 growth routes in SEO and public navigation", () => {
    for (const route of ["/missions", "/circle", "/pair", "/telegram"] as const) {
      expect(publicSeoRoutes).toContain(route);
      expect(publicPageSeo[route].title).toContain("ETerapy");
    }

    const header = source("components/header.tsx");
    const footer = source("components/footer.tsx");

    expect(header).toContain('label: "Миссии"');
    expect(footer).toContain('mainUrl("/circle")');
    expect(footer).toContain('mainUrl("/pair")');
    expect(footer).toContain('mainUrl("/telegram")');
  });

  it("keeps the v4.1 logo as the only active app icon shape", () => {
    const appIcon = source("app/icon.svg");
    const publicIcon = fs.readFileSync(path.join(process.cwd(), "public/icon.svg"), "utf8");

    expect(appIcon).toContain('viewBox="0 0 120 120"');
    expect(publicIcon).toContain('viewBox="0 0 120 120"');
    expect(appIcon).not.toContain("<path");
    expect(publicIcon).not.toContain("<path");
  });

  it("aligns service cards and prices with the v4.1 product economics", () => {
    const catalog = source("components/products/service-catalog.tsx");
    const pricing = source("app/pricing/pricing-plans.tsx");
    const products = source("lib/v5-products.ts");

    expect(catalog).toContain("Круг ясности");
    expect(catalog).toContain("Разобраться вдвоём");
    expect(catalog).toContain("Практика ясности");
    expect(catalog).toContain("soft-service-card");
    expect(catalog).not.toContain("var(--paper-card)");
    expect(pricing).toContain("499");
    expect(pricing).toContain("Без скидок на встречи со специалистами");
    expect(products).toContain("490–990 ₽");
    expect(products).toContain("299–1 290 ₽");
    expect(products).toContain("790 ₽");
  });

  it("adds the v4.1 growth loop section to the landing", () => {
    const home = source("app/page.tsx");
    const growth = source("components/landing/growth-formats.tsx");

    expect(home).toContain("<GrowthFormatsSection />");
    expect(growth).toContain("не одни в этом");
    expect(growth).toContain("Круг ясности");
    expect(growth).toContain("Разобраться вдвоём");
    expect(growth).toContain("Практика ясности");
  });

  it("keeps specialist and cabinet surfaces inside the v4.1 shell", () => {
    const specialists = source("app/practitioners/page.tsx");
    const grid = source("app/practitioners/practitioners-grid.tsx");
    const shell = source("components/cabinet/cabinet-shell.tsx");

    expect(specialists).toContain("София Мирная");
    expect(specialists).toContain("Елена Орлова");
    expect(specialists).toContain("Ника Сокол");
    expect(grid).toContain('data-testid="specialists-empty-state"');
    expect(shell).toContain("<BrandSignature compact");
    expect(shell).toContain("soft-app-sidebar-card");
  });
});
