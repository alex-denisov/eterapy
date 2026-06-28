import fs from "node:fs";
import path from "node:path";

const srcDir = path.join(process.cwd(), "src");
const source = (rel: string) => fs.readFileSync(path.join(srcDir, rel), "utf8");

// B456 — /products catalog redesign (calm tone, above-fold, scroll-spy nav).
// Owner walkthrough item 3 (B454). These are source-text assertions in the
// same style as design-v4-1-rollout / product-pages, guarding the approved copy
// and structure so a future edit can't silently regress the calm rework.
describe("B456 — /products calm catalog redesign", () => {
  const page = source("app/products/page.tsx");
  const catalog = source("components/products/service-catalog.tsx");

  it("uses the calm client-facing headline, not the internal «углубление» term", () => {
    expect(page).toContain("С чего бы вы хотели начать?");
    expect(page).toContain("выберите то, что подходит сейчас");
    expect(page).not.toContain("Углубление под");
  });

  it("drops the tall hero chrome (3-step aside + redundant second header)", () => {
    expect(page).not.toContain("как это работает");
    expect(page).not.toContain("форматы и услуги");
    expect(page).not.toContain("Выберите глубину");
    // the oversized display heading is gone from the hero
    expect(page).not.toContain("soft-display");
  });

  it("de-anchors «бесплатно»: the only free signal is the quiet 0 ₽ chip", () => {
    expect(catalog).not.toContain("Без карты и регистрации");
    // «бесплатно» must not be shouted in section labels or a CTA
    expect(catalog).not.toContain("Начать бесплатно");
  });

  it("renders the free первичный разбор as a slim entry row → /checkin", () => {
    expect(catalog).toContain("soft-entry-row");
    expect(catalog).toContain("Первый разбор");
    expect(catalog).toContain("/checkin");
  });

  it("keeps the five calm section labels and the esoteric subtitle", () => {
    expect(catalog).toContain("С чего начать");
    expect(catalog).toContain("Разобраться самостоятельно");
    expect(catalog).toContain("Вместе");
    expect(catalog).toContain("Эзотерика");
    expect(catalog).toContain("символический взгляд");
    expect(catalog).toContain("Поговорить с человеком");
  });

  it("ships the mobile sticky scroll-spy category nav", () => {
    expect(catalog).toContain('"use client"');
    expect(catalog).toContain("soft-catalog-nav");
    expect(catalog).toContain('addEventListener("scroll"');
  });

  it("densifies cards with concise captions and no in-card text link", () => {
    expect(catalog).toContain("soft-svc-card");
    expect(catalog).toContain("Взгляд на ситуацию под другим углом");
    // the old «Подробнее и заказать» / «Открыть бесплатный вход» links are gone
    expect(catalog).not.toContain("Подробнее и заказать");
    expect(catalog).not.toContain("Открыть бесплатный вход");
  });
});
