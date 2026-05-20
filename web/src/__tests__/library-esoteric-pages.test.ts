import fs from "fs";
import path from "path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B205 Library, esoteric service, and joint-session pages", () => {
  it("adds first-class v4.2 service pages for Tarot, Astro, Numerology, and joint sessions", () => {
    for (const route of ["tarot", "astro", "numerology", "joint"]) {
      const page = source(`src/app/${route}/page.tsx`);
      expect(page).toContain(`createPublicPageMetadata("/${route}")`);
      expect(page).toContain(`PublicJsonLd route="/${route}"`);
    }

    const seo = source("src/lib/seo.ts");
    const publicSeo = source("src/lib/public-page-seo.ts");

    for (const route of ["/tarot", "/astro", "/numerology", "/joint"]) {
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

    expect(catalog).toContain('href: "/tarot"');
    expect(catalog).toContain('href: "/astro"');
    expect(catalog).toContain('href: "/numerology"');
    expect(catalog).toContain('href: "/joint"');
    expect(catalog).toContain("Подробнее");
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
