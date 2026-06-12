import fs from "fs";
import path from "path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B205 Library and esoteric service pages", () => {
  it("keeps legacy esoteric URLs as redirects to canonical /products pages", () => {
    const redirects: Record<string, string> = {
      tarot: "/products/tarot",
      astro: "/products/natal-chart",
      numerology: "/products/numerology",
    };

    for (const [route, target] of Object.entries(redirects)) {
      const page = source(`src/app/${route}/page.tsx`);
      expect(page).toContain("redirect(");
      expect(page).toContain(target);
    }

    const seo = source("src/lib/seo.ts");
    const publicSeo = source("src/lib/public-page-seo.ts");

    for (const route of ["/products/tarot", "/products/natal-chart", "/products/numerology"]) {
      expect(seo).toContain(`"${route}"`);
      expect(publicSeo).toContain(`"${route}"`);
    }
  });

  it("keeps esoteric copy inside the no-prediction safety contract", () => {
    const page = source("src/components/public/esoteric-soon-page.tsx");

    expect(page).toContain("языку метафор, не как к предсказанию");
    expect(page).toContain("не обещаем точных");
    expect(page).toContain("не заменяем психолога или врача");
    // M26/B367: joint-session блок заменён на каталожный CTA с бейджем универсала.
    expect(page).toContain("психология + эзотерика");
  });

  it("links v4.2 service catalog cards to real service pages instead of placeholders", () => {
    const catalog = source("src/components/products/service-catalog.tsx");

    expect(catalog).toContain('href: "/products/tarot"');
    expect(catalog).toContain('href: "/products/natal-chart"');
    expect(catalog).toContain('href: "/products/numerology"');
    expect(catalog).not.toContain("joint-session");
    expect(catalog).toContain("Подробнее и заказать");
    expect(catalog).not.toContain('id: "tarot-d", title: "Расклад Таро", desc: "Цифровой расклад с бережной интерпретацией.", price: "390 ₽", cat: "tarot", kind: "Цифровое", href: "#"' );
  });

  it("updates library detail pages to match the v4.1 public anonymous-card structure", () => {
    const detail = source("src/app/library/[slug]/page.tsx");
    const cta = source("src/components/library/library-entry-cta.tsx");
    const ctaLib = source("src/lib/library-cta.ts");

    expect(detail).toContain("что мы услышали");
    expect(detail).toContain("главная развилка");
    expect(detail).toContain("фрагмент разбора · открыт публично");
    // B382: single-canvas redesign — boxed «Скрыто в публичной карточке» panel
    // became a typographic «что в полном разборе» section.
    expect(detail).toContain("что в полном разборе");
    expect(detail).toContain("рядом в библиотеке");
    expect(detail).toContain("LibraryEntryCta");
    // B382: CTA now drives into the mapped paid service (label from resolveLibraryCta).
    expect(cta).toContain("data-analytics-event=\"library_cta_clicked\"");
    expect(ctaLib).toContain("Разобрать свой вопрос");
  });
});
