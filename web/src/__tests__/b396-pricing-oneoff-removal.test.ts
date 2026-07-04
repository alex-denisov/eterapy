import fs from "node:fs";
import path from "node:path";

const srcDir = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcDir, relativePath), "utf8");
}

// B396 — /pricing: the long «разовые форматы» à-la-carte catalog table was
// removed (it duplicated the /products catalog + /pricing/compare, both already
// linked under the plan cards). A slim bridge to the /products catalog replaces
// it, with NO second «сравнить» button. The hero was already tightened in B454.
describe("B396 — /pricing drops the «разовые форматы» block for a slim catalog bridge", () => {
  const plans = source("app/pricing/pricing-plans.tsx");
  const page = source("app/pricing/page.tsx");

  it("removes the à-la-carte oneOff table and its scaffolding", () => {
    expect(plans).not.toContain("разовые форматы");
    expect(plans).not.toContain("Если подписка не нужна");
    expect(plans).not.toContain("oneOff");
    expect(plans).not.toContain("buildSessionRows");
    expect(plans).not.toContain("getProductPriceLabel");
    expect(plans).not.toContain("по записи");
  });

  it("adds a single slim catalog CTA pointing at /products", () => {
    expect(plans).toContain("Смотреть все форматы");
    expect(plans).toContain('data-testid="pricing-catalog-cta"');
    expect(plans).toContain('href="/products"');
  });

  it("does not duplicate the «сравнить тарифы» link (only the one under the plans)", () => {
    const compareLinks = plans.match(/href="\/pricing\/compare"/g) ?? [];
    expect(compareLinks).toHaveLength(1);
    expect(plans).toContain("Подробное сравнение");
  });

  it("keeps the honest «встречи оплачиваются отдельно» line in the hero", () => {
    expect(plans).toContain("оплачиваются отдельно по полной цене");
  });

  it("drops the now-unused session-floor DB round-trip from the page", () => {
    expect(page).not.toContain("getMinSessionPriceRub");
    expect(page).not.toContain("minSessionPriceRub");
    expect(page).not.toContain("await");
    // still a valid server component that renders the static plan metadata
    expect(page).toContain("<PricingPlans />");
  });
});
