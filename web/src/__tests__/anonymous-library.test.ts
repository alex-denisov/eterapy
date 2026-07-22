import fs from "node:fs";
import path from "node:path";
import { approvedLibraryEntries, anonymousLibraryEntries, getApprovedLibraryEntry, libraryTopics } from "@/data/anonymous-library";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";
import { GET as sitemapXml } from "@/app/sitemap.xml/route";

const srcDir = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcDir, relativePath), "utf8");
}

function requestFor(host: string, pathname = "/sitemap.xml") {
  return new Request(`https://${host}${pathname}`, { headers: { host } });
}

describe("anonymous question library", () => {
  it("is a public SEO route with moderated approved entries only", () => {
    expect(publicSeoRoutes).toContain("/library");
    expect(publicPageSeo["/library"].title).toContain("Библиотека");
    expect(approvedLibraryEntries().length).toBeGreaterThan(2);
    expect(libraryTopics()).toEqual(expect.arrayContaining(["Отношения", "Работа и деньги"]));
    expect(getApprovedLibraryEntry("deleted-private-case")).toBeUndefined();
  });

  it("renders browse and detail pages with no open comments", () => {
    const listPage = source("app/library/page.tsx");
    const detailPage = source("app/library/[slug]/page.tsx");

    expect(listPage).toContain('data-testid="anonymous-library-page"');
    expect(listPage).toContain("Без комментариев, диагнозов и готовых решений за вас");
    expect(listPage).toContain('data-testid="library-dialogue-cta"');
    const cta = source("components/library/library-entry-cta.tsx");
    expect(detailPage).toContain("LibraryEntryCta");
    expect(cta).toContain('data-testid="library-entry-dialogue-cta"');
    expect(detailPage).toContain("короткий ответ");
    expect(detailPage).toContain("что можно проверить");
    expect(detailPage).toContain("Как подготовлен материал");
    expect(detailPage).toContain("libraryFaqs");
    expect(cta).toContain("откликов по теме");
    expect(detailPage).not.toContain("Вопрос обезличен и прошел модерацию");
  });

  it("adds only approved and indexable question pages to sitemap", async () => {
    const response = await sitemapXml(requestFor("eterapy.com"));
    const body = await response.text();

    for (const entry of anonymousLibraryEntries) {
      if (entry.status === "approved" && entry.indexable) {
        expect(body).toContain(`https://eterapy.com/library/${entry.slug}`);
      } else {
        expect(body).not.toContain(`/library/${entry.slug}`);
      }
    }
  });
});
