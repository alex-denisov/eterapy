import fs from "node:fs";
import path from "node:path";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";

const srcDir = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcDir, relativePath), "utf8");
}

describe("v5 pricing page", () => {
  it("is included in public SEO and navigation", () => {
    expect(publicSeoRoutes).toContain("/pricing");
    expect(publicPageSeo["/pricing"].title).toBe("Цены и тарифы ETerapy");
    expect(source("components/header.tsx")).toContain('href: "/pricing"');
    expect(source("components/footer.tsx")).toContain('href="/pricing"');
  });

  it("publishes v5 price ranges and subscription mechanics", () => {
    const page = source("app/pricing/page.tsx");

    expect(page).toContain('data-testid="pricing-page"');
    expect(page).toContain("Первичный");
    expect(page).toContain("4 ракурса ответа");
    expect(page).toContain("299 ₽");
    expect(page).toContain("490-990 ₽");
    expect(page).toContain("299-1490 ₽");
    expect(page).toContain("590-990 ₽");
    expect(page).toContain("790-1490 ₽");
    expect(page).toContain("399-599 ₽/мес");
    expect(page).toContain("999-1490 ₽/мес");
    expect(page).toContain("990-2990 ₽/мес");
    expect(page).toContain("Углублённые отчёты открываются");
  });

  it("keeps pricing question-first, with practitioner as a later step", () => {
    const page = source("app/pricing/page.tsx");

    expect(page).toContain('href="/all-modalities/checkin"');
    expect(page).toContain('data-testid="pricing-dialogue-cta"');
    expect(page).toContain("Специалист появляется в рекомендации только после того, как вы изложили суть вопроса");
    expect(page).not.toContain('href="/practitioners"');
  });
});
