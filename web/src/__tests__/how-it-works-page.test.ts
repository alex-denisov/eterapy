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

  it("explains the v4.2 clarity path, product catalog, and specialist handoff", () => {
    const page = source("app/how-it-works/page.tsx");

    expect(page).toContain('data-testid="how-it-works-page"');
    expect(page).toContain("Вы пишете своими словами");
    expect(page).toContain("Мы задаём 2–4 коротких вопроса");
    expect(page).toContain("первичный разбор");
    // B374: trimmed to three steps; углубление + сохранение folded into step 03.
    expect(page).toContain("углубление по выбору");
    expect(page).toContain("сохраняется в Дневник");
    // B292: replaced two internal-spec headings with user-facing copy.
    expect(page).toContain("если уже знаете, что нужно");
    expect(page).toContain("Откройте нужный формат");
    expect(page).toContain("Когда мы перенаправим к человеку");
    expect(page).toContain("Регулярно");
    expect(page).toContain("выгоднее в подписке");
  });

  it("links public navigation to the durable route, not only the home anchor", () => {
    const header = source("components/header.tsx");

    expect(header).toContain('href: "/how-it-works"');
  });
});
