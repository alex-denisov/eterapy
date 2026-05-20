import fs from "fs";
import path from "path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B205 Library, esoteric service, and joint-session pages", () => {
  it("keeps legacy esoteric URLs as redirects to canonical /products pages", () => {
    const redirects: Record<string, string> = {
      tarot: "/products/tarot",
      astro: "/products/natal-chart",
      numerology: "/products/numerology",
      joint: "/products/joint-session",
    };

    for (const [route, target] of Object.entries(redirects)) {
      const page = source(`src/app/${route}/page.tsx`);
      expect(page).toContain("redirect(");
      expect(page).toContain(target);
    }

    const seo = source("src/lib/seo.ts");
    const publicSeo = source("src/lib/public-page-seo.ts");

    for (const route of ["/products/tarot", "/products/natal-chart", "/products/numerology", "/products/joint-session"]) {
      expect(seo).toContain(`"${route}"`);
      expect(publicSeo).toContain(`"${route}"`);
    }
  });

  it("keeps esoteric copy inside the no-prediction safety contract", () => {
    const page = source("src/components/public/esoteric-soon-page.tsx");

    expect(page).toContain("языку метафор, не как к предсказанию");
    expect(page).toContain("не обещаем точных");
    expect(page).toContain("не заменяем психолога или врача");
    expect(page).toContain("нет прогнозов как фактов");
    expect(page).toContain("без скидок на встречи");
  });

  it("links v4.2 service catalog cards to real service pages instead of placeholders", () => {
    const catalog = source("src/components/products/service-catalog.tsx");

    expect(catalog).toContain('href: "/products/tarot"');
    expect(catalog).toContain('href: "/products/natal-chart"');
    expect(catalog).toContain('href: "/products/numerology"');
    expect(catalog).toContain('href: "/products/joint-session"');
    expect(catalog).toContain("Подробнее и заказать");
    expect(catalog).not.toContain('id: "tarot-d", title: "Расклад Таро", desc: "Цифровой расклад с бережной интерпретацией.", price: "390 ₽", cat: "tarot", kind: "Цифровое", href: "#"' );
  });

  it("updates library detail pages to match the v4.1 public anonymous-card structure", () => {
    const detail = source("src/app/library/[slug]/page.tsx");

    expect(detail).toContain("что мы услышали");
    expect(detail).toContain("главная развилка");
    expect(detail).toContain("фрагмент разбора · открыт публично");
    expect(detail).toContain("Скрыто в публичной карточке");
    expect(detail).toContain("рядом в библиотеке");
    expect(detail).toContain("Начать свой разбор");
  });
});
