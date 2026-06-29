import fs from "node:fs";
import path from "node:path";

// B461 (M28, walkthrough item 19): /pricing/compare actualised + honest.
// - The Free/«Базовый» column stops implying paid products are included (INC-014):
//   a green ✓ now means ONLY «входит в тариф»; à-la-carte products render a
//   neutral price, not a check.
// - Plan names match the tariff cards («Базовый», not «Free»).
// - «из кошелька» and «по тарифу специалиста» are explained in a legend.
// - Numbers mirror the single billing source (3/день free, 12/20 баллов, prices).

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", relativePath), "utf8");
}

describe("B461 — /pricing/compare honest redesign", () => {
  const compare = source("app/pricing/compare/page.tsx");

  it("renames the Free column to «Базовый» and aligns the H1", () => {
    expect(compare).toContain("Базовый");
    expect(compare).toContain("Что входит в Базовый");
    // The English «Free» column/header label is gone (consistency with the cards).
    expect(compare).not.toContain('"Free"');
    expect(compare).not.toMatch(/в Free,/);
  });

  it("encodes cells as tagged states, not a boolean ✓ — so the check means only «входит»", () => {
    // The honest model: a ✓ is reserved for included-in-plan; paid products are
    // tagged à-la-carte and must NOT reuse the included check.
    expect(compare).toContain('kind: "included"');
    expect(compare).toContain('kind: "alacarte"');
    expect(compare).toContain('kind: "wallet"');
    // The two free-in-plan anchors stay included only where true: reframe in
    // both plans, deep-report only in premium.
    expect(compare).toContain('slug: "reframe"');
    expect(compare).toContain('slug: "deep-report"');
  });

  it("actualises the primary-разбор limits to the enforced reality (3/день free, без ограничений на подписке)", () => {
    expect(compare).toContain("до 3 в день");
    expect(compare).toContain("без ограничений");
    // Honest footnote about the unauthenticated entry point (no «гость» wording).
    expect(compare).toContain("Без регистрации");
    expect(compare).not.toContain("1 / день");
    expect(compare).not.toContain("в неделю");
  });

  it("keeps the monthly-credit mirror (12 / 20) the billing test depends on", () => {
    expect(compare).toContain('"12 / месяц"');
    expect(compare).toContain('"20 / месяц"');
  });

  it("moves the welcome баллы out of the product rows into one honest footnote", () => {
    expect(compare).toContain("в подарок");
    expect(compare).toContain("14 дней");
  });

  it("explains «из кошелька» and «по тарифу специалиста» in a legend", () => {
    expect(compare).toContain("из кошелька");
    expect(compare).toContain("по тарифу специалиста");
    expect(compare).toMatch(/как читать/i);
    // No subscription discount on meetings — but never the banned «по полной ставке».
    expect(compare).not.toContain("по полной ставке");
  });

  it("collapses the catalog into one «Остальные разборы» row with a price escape hatch", () => {
    expect(compare).toContain("Остальные разборы");
    expect(compare).toContain("/products");
  });

  it("puts the primary CTAs on the first screen (hero), not only the page bottom", () => {
    expect(compare).toContain('href="/checkin"');
    expect(compare).toContain('href="/products"');
  });

  it("renders a no-horizontal-scroll mobile layout (stacked per-plan cards)", () => {
    expect(compare).toContain("md:hidden");
    expect(compare).toContain('data-testid="compare-mobile"');
    expect(compare).toContain('data-testid="compare-desktop"');
  });

  it("drops the unverified plan-gated Дневник row (no plan-gating exists in code)", () => {
    expect(compare).not.toContain("ограниченная история");
    expect(compare).not.toContain("расширенная карта и аналитика");
  });
});
