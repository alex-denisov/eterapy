import fs from "node:fs";
import path from "node:path";
import { approvedLibraryEntries, anonymousLibraryEntries } from "@/data/anonymous-library";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";
import { GET as sitemapXml } from "@/app/sitemap.xml/route";
import { libraryMetaDescription, libraryMetaTitle } from "@/lib/library-editorial";
import { libraryIsIndexable } from "@/lib/library-depth";

const srcDir = path.join(process.cwd(), "src");
const source = (rel: string) => fs.readFileSync(path.join(srcDir, rel), "utf8");

describe("B384 — library cards as search targets (schema.org)", () => {
  const detail = source("app/library/[slug]/page.tsx");

  it("emits an enriched free Article and FAQPage in a @graph", () => {
    expect(detail).toContain('"@graph"');
    expect(detail).toContain('"@type": "Article"');
    expect(detail).toContain("articleSection: entry.topic");
    expect(detail).toContain("isAccessibleForFree: true");
    expect(detail).toContain("mainEntityOfPage");
    expect(detail).toContain('"@type": "FAQPage"');
    expect(detail).toContain("dateModified: libraryEditorialDate(entry)");
  });

  it("emits a BreadcrumbList (Главная → Библиотека → тема)", () => {
    expect(detail).toContain('"@type": "BreadcrumbList"');
    expect(detail).toContain('name: "Библиотека"');
  });

  it("uses each card's per-card seo for title/description + OpenGraph", () => {
    expect(detail).toContain("libraryMetaTitle(entry)");
    expect(detail).toContain("libraryMetaDescription(entry)");
    expect(detail).toContain("openGraph");
  });
});

describe("B384 — unique, search-friendly metadata", () => {
  it("every public route has a unique title and description", () => {
    const titles = publicSeoRoutes.map((r) => publicPageSeo[r].title);
    const descriptions = publicSeoRoutes.map((r) => publicPageSeo[r].description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("every library card with seo has a unique metaTitle within 60 chars", () => {
    const withSeo = approvedLibraryEntries().filter((e) => e.seo);
    const titles = withSeo.map((e) => e.seo!.metaTitle);
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of titles) expect(t.length).toBeLessThanOrEqual(60);
  });

  it("every published library card has unique bounded metadata, including legacy cards", () => {
    const titles = approvedLibraryEntries().map(libraryMetaTitle);
    expect(new Set(titles).size).toBe(titles.length);
    for (const entry of approvedLibraryEntries()) {
      expect(libraryMetaTitle(entry).length).toBeLessThanOrEqual(65);
      expect(libraryMetaDescription(entry).length).toBeLessThanOrEqual(158);
    }
  });

  it("library card metaTitles do not collide with public-page titles", () => {
    const publicTitles = new Set(publicSeoRoutes.map((r) => publicPageSeo[r].title));
    for (const entry of approvedLibraryEntries()) {
      if (entry.seo) expect(publicTitles.has(entry.seo.metaTitle)).toBe(false);
    }
  });
});

describe("B384 — sitemap covers the full published catalogue", () => {
  /**
   * B714 — КАРТА САЙТА БОЛЬШЕ НЕ РАВНА КАТАЛОГУ, И ЭТО ГЛАВНОЕ ИЗМЕНЕНИЕ.
   *
   * Прежняя проверка сторожила равенство «каталог = карта сайта» и была верна
   * ровно до 2026-08-17, когда Яндекс вынес из индекса 176 страниц из 219
   * разом. Причина: 199 адресов из 251 несли ≈60 уникальных слов каждый, и
   * корпус профилировал хост как ферму шаблонов.
   *
   * Теперь в карту сайта идёт то, что прошло гейт глубины, а каталог остаётся
   * людям целиком. Проверяется соответствие карты сайта ГЕЙТУ, а заодно то,
   * что тонкая карточка в карту не просочилась.
   */
  it("lists every card that passes the depth gate and no others", async () => {
    const res = await sitemapXml(new Request("https://eterapy.com/sitemap.xml", { headers: { host: "eterapy.com" } }));
    const body = await res.text();
    const approved = anonymousLibraryEntries.filter((e) => e.status === "approved");
    const deep = approved.filter((e) => libraryIsIndexable(e));
    const thin = approved.filter((e) => !libraryIsIndexable(e));

    // Каталог людям не сократился: карточки никуда не делись.
    expect(approved.length).toBeGreaterThanOrEqual(199);
    // А в индекс предлагается только то, у чего есть собственный материал.
    expect(deep.length).toBeGreaterThan(0);
    expect(deep.length).toBeLessThan(approved.length / 2);

    for (const entry of deep) {
      expect(body).toContain(`https://eterapy.com/library/${entry.slug}`);
    }
    for (const entry of thin) {
      expect(body).not.toContain(`https://eterapy.com/library/${entry.slug}`);
    }
  });
});
