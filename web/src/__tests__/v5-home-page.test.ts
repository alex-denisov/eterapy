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
    expect(hero).toContain("Начать диалог");
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
    expect(page).toContain('data-ui-version="design-v4-soft-clarity"');
    expect(hero).not.toContain("HaloVisual");
    expect(hero).not.toContain("premium-shell");
    expect(hero).not.toContain("next/image");
    expect(hero).not.toContain("brandAssets.icons");
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
    expect(howItWorks).toContain("Углубление по выбору");
    expect(cta).toContain("Специалист появляется как следующий шаг");
    expect(cta).toContain('href="/checkin"');
  });
});
