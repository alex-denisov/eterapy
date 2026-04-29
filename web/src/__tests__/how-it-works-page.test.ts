import fs from "node:fs";
import path from "node:path";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";

const srcDir = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcDir, relativePath), "utf8");
}

describe("v5 how-it-works page", () => {
  it("is a first-class public SEO route", () => {
    expect(publicSeoRoutes).toContain("/how-it-works");
    expect(publicPageSeo["/how-it-works"].title).toBe("Как работает ETerapy");
  });

  it("explains the free-to-paid-to-practitioner path", () => {
    const page = source("app/how-it-works/page.tsx");

    expect(page).toContain('data-testid="how-it-works-page"');
    expect(page).toContain("Вопрос вместо каталога");
    expect(page).toContain("Бесплатный первичный ответ");
    expect(page).toContain("Платная глубина или подписка");
    expect(page).toContain("Специалист как следующий шаг");
    expect(page).toContain("нет платного CTA в кризисе");
  });

  it("links public navigation to the durable route, not only the home anchor", () => {
    const header = source("components/header.tsx");

    expect(header).toContain('href: "/how-it-works"');
  });
});
