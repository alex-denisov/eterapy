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

  it("publishes v5 prices and subscription mechanics", () => {
    const page = source("app/pricing/page.tsx");
    const plans = source("app/pricing/pricing-plans.tsx");
    const combined = page + "\n" + plans;

    expect(page).toContain('data-testid="pricing-page"');
    expect(combined).toContain("Первичный");
    expect(combined).toContain("4 ракурса ответа");
    expect(combined).toContain("299 ₽");
    expect(combined).toContain("490-990 ₽");
    expect(combined).toContain("299-1490 ₽");
    expect(combined).toContain("590-990 ₽");
    expect(combined).toContain("790-1490 ₽");
    // Plus: month 599 / year 399
    expect(combined).toContain("599 ₽/мес");
    expect(combined).toContain("399 ₽/мес");
    // Premium: month 1490 / year 999
    expect(combined).toContain("1490 ₽/мес");
    expect(combined).toContain("999 ₽/мес");
    // Practitioner Pro: month 2990 / year 990
    expect(combined).toContain("2990 ₽/мес");
    expect(combined).toContain("990 ₽/мес");
    expect(combined).toContain("Углублённые отчёты открываются");
  });

  it("keeps pricing question-first, with practitioner as a later step", () => {
    const page = source("app/pricing/page.tsx");
    const plans = source("app/pricing/pricing-plans.tsx");
    const combined = page + "\n" + plans;

    expect(combined).toContain('href="/all-modalities/checkin"');
    expect(combined).toContain('data-testid="pricing-dialogue-cta"');
    expect(combined).toContain("Специалист появляется в рекомендации только после того, как вы изложили суть вопроса");
    expect(combined).not.toContain('href="/practitioners"');
  });
});
