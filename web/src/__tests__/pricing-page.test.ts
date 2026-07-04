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
    // B464 IB0: the landing nav lives in the shared nav-model.
    expect(source("lib/nav-model.ts")).toContain('href: "/pricing"');
    expect(source("components/footer.tsx")).toContain('mainUrl("/pricing")');
  });

  it("publishes v5 prices and subscription mechanics", () => {
    const page = source("app/pricing/page.tsx");
    const plans = source("app/pricing/pricing-plans.tsx");
    const combined = page + "\n" + plans;

    expect(page).toContain('data-testid="pricing-page"');
    expect(combined).toContain("Первый разбор");
    expect(combined).toContain("Переосмысление");
    // B396: the long «разовые форматы» à-la-carte table was removed — a slim link
    // to the /products catalog replaces it (no per-format price literals here).
    expect(combined).not.toContain("разовые форматы");
    expect(combined).not.toContain("buildSessionRows");
    expect(combined).toContain("Смотреть все форматы");
    expect(combined).toContain('data-testid="pricing-catalog-cta"');
    expect(combined).toContain('href="/products"');
    // B348/Механика 1: подписки только месячные — годовых планов и тумблера «на год» нет.
    expect(combined).toContain("590");
    expect(combined).not.toContain("5900");
    expect(combined).not.toContain("На год");
    expect(combined).not.toContain("yearPrice");
    expect(combined).toContain("Без скидок на встречи");
    expect(combined).toContain("Подробное сравнение");
    expect(publicSeoRoutes).toContain("/pricing/compare");
    // Premium: 1490 per month (no yearly), with 20 monthly credits.
    expect(combined).toContain("1490");
    expect(combined).toContain("+20 баллов");
    expect(combined).not.toContain("14900");
    // Practitioner tiers live on /practitioners/apply, not in client pricing cards.
    expect(combined).not.toContain('id: "practitioner"');
    expect(source("app/practitioners/apply/page.tsx")).toContain("Pro+");
    expect(source("app/practitioners/apply/page.tsx")).toContain("комиссия");
    // B396: /pricing no longer does a DB round-trip for the «Встречи» floor — the
    // session-pricing helper is gone from this page (it still powers other surfaces).
    expect(page).not.toContain("getMinSessionPriceRub");
    expect(page).not.toContain("await");
    expect(combined).toContain("Углублённые отчёты открываются");
  });

  it("keeps pricing question-first, with practitioner as a later step", () => {
    const page = source("app/pricing/page.tsx");
    const plans = source("app/pricing/pricing-plans.tsx");
    const combined = page + "\n" + plans;

    expect(combined).toContain('href="/checkin"');
    expect(combined).toContain('data-testid="pricing-dialogue-cta"');
    expect(combined).toContain("Это отдельная B2B-страница, не клиентский тариф");
    expect(combined).toContain('href="/practitioners/apply"');
  });
});
