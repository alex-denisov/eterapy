import fs from "node:fs";
import path from "node:path";
import { GET as llms } from "@/app/llms.txt/route";
import { GET as llmsFull } from "@/app/llms-full.txt/route";
import { homeAuthorityJsonLd, HOME_FAQS } from "@/lib/home-authority-content";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B469 AI search readiness", () => {
  it("serves a concise llms.txt with canonical public resources", async () => {
    const response = llms();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("# ETerapy");
    expect(body).toContain("https://eterapy.com/how-it-works");
    expect(body).toContain("https://eterapy.com/llms-full.txt");
    expect(body).toContain("not diagnosis, treatment, psychotherapy");
  });

  it("serves full definitions, decision rules, FAQ, and source policy", async () => {
    const response = llmsFull();
    const body = await response.text();

    expect(body).toContain("## Definitions");
    expect(body).toContain("## Decision rules");
    expect(body).toContain("## Frequently asked questions");
    expect(body).toContain("## Source and citation policy");
    expect(body).toContain("who.int");
  });

  it("keeps Article and FAQ schema aligned with visible server content", () => {
    const [article, faq] = homeAuthorityJsonLd();
    const component = source("src/components/landing/authority-article.tsx");
    const page = source("src/app/page.tsx");

    expect(article).toEqual(expect.objectContaining({
      "@type": "Article",
      author: expect.objectContaining({ name: "ETerapy" }),
      dateModified: "2026-07-15",
    }));
    expect(faq).toEqual(expect.objectContaining({
      "@type": "FAQPage",
      mainEntity: expect.arrayContaining([
        expect.objectContaining({ name: HOME_FAQS[0].question }),
      ]),
    }));
    expect(component).toContain("<article");
    expect(component).toContain("<table");
    expect(component).toContain("<details");
    expect(component).toContain("редакция ETerapy");
    expect(page).toContain("<HomeAuthorityArticle />");
  });
});
