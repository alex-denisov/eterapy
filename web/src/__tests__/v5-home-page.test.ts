import fs from "node:fs";
import path from "node:path";

const srcDir = path.join(process.cwd(), "src");

function source(relativePath: string) {
  return fs.readFileSync(path.join(srcDir, relativePath), "utf8");
}

describe("v5 public home page", () => {
  it("makes the first viewport question-first instead of marketplace-first", () => {
    const hero = source("components/landing/hero.tsx");

    expect(hero).toContain('data-testid="v5-home-hero"');
    expect(hero).toContain('data-testid="v5-question-entry"');
    expect(hero).toContain('name="question"');
    expect(hero).toContain('action="/checkin"');
    expect(hero).toContain("Получить разбор");
    expect(hero).toContain('data-analytics-event="dialogue_cta_clicked"');
    expect(hero).toContain("PLACEHOLDERS[phIdx]");
    expect(hero).toContain("setQuestion(`${topic}: `)");
    expect(hero).toContain("home-topic-");
    expect(hero).not.toContain('href="/practitioners"');
    expect(hero).not.toContain("Найти практика");
  });

  it("keeps the landing hero organic, v4-soft, and free of framed PNG artwork", () => {
    const hero = source("components/landing/hero.tsx");
    const page = source("app/page.tsx");

    expect(hero).toContain("<SoftHaloMark");
    expect(hero).toContain("soft-ask-card");
    expect(hero).toContain("soft-question-input");
    expect(page).toContain('data-ui-version="design-v4-2-soft-clarity"');
    expect(hero).not.toContain("HaloVisual");
    expect(hero).not.toContain("premium-shell");
    expect(hero).not.toContain("next/image");
    expect(hero).not.toContain("brandAssets.icons");
  });

  it("makes v4.2 free-to-paid sequencing explicit without a direct paywall", () => {
    const hero = source("components/landing/hero.tsx");
    const services = source("components/products/service-catalog.tsx");

    expect(hero).toContain("soft-hero-v42");
    expect(hero).toContain("soft-halo-stage-compact");
    // Primary разбор is /checkin (no standalone product page after B293).
    expect(services).toContain('href: "/checkin"');
    // B456: the free entry is the calm «Первый разбор» row (no «бесплатно» CTA).
    expect(services).toContain("Первый разбор");
    // B366: session floor derives from the single source (formatSessionFloor()).
    expect(services).toContain("formatSessionFloor");
    expect(services).toContain('href: "/products/tarot"');
  });

  it("B374: replaces the 21-card catalog with three scenario-routers below the hero", () => {
    const page = source("app/page.tsx");
    const scenarios = source("components/landing/scenarios.tsx");

    // The catalog «простыня» and B2B block are gone from the landing.
    expect(page).toContain("<ScenariosSection />");
    expect(page).not.toContain("AIToolsSection");
    expect(page).not.toContain("ForPractitionersSection");
    expect(page).not.toContain("GrowthFormatsSection");
    expect(page).not.toContain("EsotericShowcaseSection");

    // Three routers: понять самому · вместе · специалист.
    expect(scenarios).toContain('data-testid="v5-home-scenarios"');
    expect(scenarios).toContain('href: "/products"');
    expect(scenarios).toContain('href: "/products/pair"');
    expect(scenarios).toContain('href: "/practitioners"');
    expect(scenarios).toContain("scenario_clicked");
    // No individual service card from the 21-item catalog is hardcoded here.
    expect(scenarios).not.toContain("/products/tarot");
    expect(scenarios).not.toContain("/products/natal-chart");
  });

  it("keeps home analytics hooks explicit and stable", () => {
    const page = source("app/page.tsx");
    const analytics = source("components/landing/home-analytics.tsx");
    const hero = source("components/landing/hero.tsx");

    expect(page).toContain("<HomeAnalytics />");
    expect(analytics).toContain("home_viewed");
    expect(hero).toContain("dialogue_cta_clicked");
    expect(analytics).toContain("eterapy:analytics");
  });

  it("describes specialist access as a later step", () => {
    const cta = source("components/landing/cta.tsx");
    const howItWorks = source("components/landing/how-it-works.tsx");

    expect(howItWorks).toContain("Опишите своими словами");
    // B374: how-it-works trimmed to three steps; углубление folded into step 03.
    expect(howItWorks).toContain("Первичный разбор");
    expect(cta).toContain("Начать разбор");
    expect(cta).toContain('href="/checkin"');
  });
});
