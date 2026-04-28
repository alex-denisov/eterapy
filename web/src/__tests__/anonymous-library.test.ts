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
    expect(libraryTopics()).toEqual(expect.arrayContaining(["Отношения", "Работа"]));
    expect(getApprovedLibraryEntry("deleted-private-case")).toBeUndefined();
  });

  it("renders browse and detail pages with no open comments", () => {
    const listPage = source("app/library/page.tsx");
    const detailPage = source("app/library/[slug]/page.tsx");

    expect(listPage).toContain('data-testid="anonymous-library-page"');
    expect(listPage).toContain("Комментарии");
    expect(listPage).toContain("нет");
    expect(listPage).toContain('data-testid="library-dialogue-cta"');
    expect(detailPage).toContain('data-testid="library-entry-dialogue-cta"');
    expect(detailPage).toContain("Вопрос обезличен и прошел модерацию");
  });

  it("adds only approved and indexable question pages to sitemap", async () => {
    const response = sitemapXml(requestFor("eterapy.com"));
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
