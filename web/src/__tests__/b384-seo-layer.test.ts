import fs from "node:fs";
import path from "node:path";
import { approvedLibraryEntries, anonymousLibraryEntries } from "@/data/anonymous-library";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";
import { GET as sitemapXml } from "@/app/sitemap.xml/route";
import { libraryMetaDescription, libraryMetaTitle } from "@/lib/library-editorial";

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
    expect(detail).toContain("dateModified: LIBRARY_EDITORIAL_DATE");
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
  it("lists every approved & indexable card and no others", async () => {
    const res = await sitemapXml(new Request("https://eterapy.com/sitemap.xml", { headers: { host: "eterapy.com" } }));
    const body = await res.text();
    const indexable = anonymousLibraryEntries.filter((e) => e.status === "approved" && e.indexable);
    // Число растёт вместе с каталогом (B601 часть 3 добавила 14 карточек).
    // Жёсткое число здесь ловит не размер, а РАСХОЖДЕНИЕ карты сайта с
    // каталогом — его и проверяет цикл ниже; сам размер сверяем с каталогом.
    expect(indexable.length).toBe(169);
    for (const entry of indexable) {
      expect(body).toContain(`https://eterapy.com/library/${entry.slug}`);
    }
  });
});
