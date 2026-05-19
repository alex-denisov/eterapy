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
    expect(source("components/footer.tsx")).toContain('mainUrl("/pricing")');
  });

  it("publishes v5 prices and subscription mechanics", () => {
    const page = source("app/pricing/page.tsx");
    const plans = source("app/pricing/pricing-plans.tsx");
    const combined = page + "\n" + plans;

    expect(page).toContain('data-testid="pricing-page"');
    expect(combined).toContain("Первичный");
    expect(combined).toContain("4 ракурса ответа");
    expect(combined).toContain("299 ₽");
    // Plus: 490 per month / 4900 per year in v4.2
    expect(combined).toContain("490");
    expect(combined).toContain("4900");
    expect(combined).toContain("Без скидок на встречи со специалистами");
    // Premium: 1290 per month / 12900 per year
    expect(combined).toContain("1290");
    expect(combined).toContain("12900");
    // Practitioner Pro: 1490 per month / 14900 per year
    expect(combined).toContain('id: "practitioner"');
    expect(combined).toContain("1490");
    expect(combined).toContain("14900");
    expect(combined).toContain("от 4 500 ₽");
    expect(combined).toContain("от 6 000 ₽");
    expect(combined).toContain("Углублённые отчёты открываются");
  });

  it("keeps pricing question-first, with practitioner as a later step", () => {
    const page = source("app/pricing/page.tsx");
    const plans = source("app/pricing/pricing-plans.tsx");
    const combined = page + "\n" + plans;

    expect(combined).toContain('href="/checkin"');
    expect(combined).toContain('data-testid="pricing-dialogue-cta"');
    expect(combined).toContain("Специалист появляется в рекомендации только после того, как вы изложили суть вопроса");
    expect(combined).not.toContain('href="/practitioners"');
  });
});
