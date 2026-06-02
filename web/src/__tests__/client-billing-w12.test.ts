import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const page = read("src/app/cabinet/billing/page.tsx");

describe("W12 — unified billing wallet", () => {
  it("consolidates balance + top-up + cards into one «Кошелёк» block", () => {
    expect(page).toContain('data-testid="client-wallet"');
    expect(page).toContain("кошелёк");
    expect(page).toContain('data-testid="client-wallet-balance"');
  });

  it("exposes a single top-up CTA driven by the default card", () => {
    expect(page).toContain("const defaultCard =");
    expect(page).toContain('data-testid="client-topup-submit"');
    expect(page).toContain("Оплатить другой картой");
    // the old separate balance-card «Пополнить» button is gone
    expect(page).not.toContain('"Создание платежа..." : "Пополнить"');
  });

  it("drops the redundant per-card «Пополнить» (the default card drives top-up)", () => {
    // the per-card face no longer renders its own top-up button
    expect(page).not.toContain('{payingWithSaved ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Пополнить"}');
  });

  it("only promotes «Привязать карту» when no card exists; «Ещё карта» otherwise", () => {
    expect(page).toContain("Ещё карта");
    expect(page).toContain("Карта не привязана");
    expect(page).toContain("linkedCards.length > 0 &&");
  });
});
