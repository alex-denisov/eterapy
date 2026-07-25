import fs from "fs";
import path from "path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B205 Library and esoteric service pages", () => {
  it("does not keep experimental section hubs or redirect them", () => {
    for (const route of ["esoterika", "esotericism"]) {
      expect(fs.existsSync(path.join(root, `src/app/library/${route}/page.tsx`))).toBe(false);
      expect(fs.existsSync(path.join(root, `src/app/library/${route}/route.ts`))).toBe(false);
    }

    const detail = source("src/app/library/[slug]/page.tsx");
    expect(detail).toContain("export const dynamicParams = false");

    const proxy = source("src/proxy.ts");
    expect(proxy).toContain("function unknownLibrarySlug");
    expect(proxy).toContain("unknownLibrarySlug(pathname)");
  });

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
    // B456: cards link to real pages (no in-card «Подробнее и заказать» link).
    expect(catalog).toContain('href: "/products/human-design"');
    expect(catalog).not.toContain('id: "tarot-d", title: "Расклад Таро", desc: "Цифровой расклад с бережной интерпретацией.", price: "390 ₽", cat: "tarot", kind: "Цифровое", href: "#"' );
  });

  it("keeps the library detail page aligned with the current editorial structure", () => {
    const detail = source("src/app/library/[slug]/page.tsx");
    const cta = source("src/components/library/library-entry-cta.tsx");
    const ctaLib = source("src/lib/library-cta.ts");

    expect(detail).toContain("короткий ответ");
    expect(detail).toContain("что здесь важно различить");
    expect(detail).toContain("что можно проверить");
    expect(detail).toContain("первый шаг");
    expect(detail).toContain("Как подготовлен материал");
    expect(detail).toContain("Частые вопросы");
    expect(detail).toContain("рядом в библиотеке");
    expect(detail).toContain("LibraryEntryCta");
    // B382: CTA now drives into the mapped paid service (label from resolveLibraryCta).
    expect(cta).toContain("data-analytics-event=\"library_cta_clicked\"");
    expect(ctaLib).toContain("Разобрать свой вопрос");
  });
});
