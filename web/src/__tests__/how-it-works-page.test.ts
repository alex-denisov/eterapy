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

  it("explains the four-step clarity path", () => {
    const page = source("app/how-it-works/page.tsx");

    expect(page).toContain('data-testid="how-it-works-page"');
    expect(page).toContain("Опишите своими словами");
    expect(page).toContain("Несколько уточнений");
    expect(page).toContain("Первичный разбор");
    expect(page).toContain("Углубление по выбору");
    expect(page).toContain("мы помогаем");
    expect(page).toContain("мы не обещаем");
  });

  it("links public navigation to the durable route, not only the home anchor", () => {
    const header = source("components/header.tsx");

    expect(header).toContain('href: "/how-it-works"');
  });
});
