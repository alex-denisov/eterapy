import { readFileSync } from "fs";
import { join } from "path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * B349 / Механика 2 — /wallet и /credits были двумя страницами с одной
 * функцией. Теперь одна страница «Кошелёк» (/wallet): баланс + пополнение +
 * каталог трат. /credits — только бэкомпат-редирект. «Пополнить» ведёт на
 * пополнение (/wallet), а не на страницу траты.
 */
describe("B349 — wallet/credits merge", () => {
  it("/credits is now just a redirect to /wallet (no second page)", () => {
    const credits = source("src/app/cabinet/credits/page.tsx");
    expect(credits).toContain("redirect(appUrl(\"/wallet\"))");
    expect(credits).not.toContain("cabinet-credits-page");
    expect(credits).not.toContain("ProductPurchaseControls");
  });

  it("/wallet holds both top-up packs and the spend catalog", () => {
    const wallet = source("src/app/cabinet/wallet/page.tsx");
    expect(wallet).toContain('data-testid="cabinet-wallet-page"');
    // top-up
    expect(wallet).toContain("CreditPackPurchaseButton");
    expect(wallet).toContain('id="wallet-topup"');
    // spend catalog (merged from /credits)
    expect(wallet).toContain("ProductPurchaseControls");
    expect(wallet).toContain('id="credits-products"');
    expect(wallet).toContain("welcome-credits-card");
    expect(wallet).toContain("getCreditWalletSnapshot");
  });

  it("cabinet nav shows one money/credits item — no duplicate «Кредиты ясности»", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain('label: "Кошелёк"');
    expect(shell).not.toContain('label: "Кредиты ясности"');
    expect(shell).not.toContain('appUrl("/credits")');
  });

  it("«Пополнить» entry points route to /wallet (top-up), not the spend page", () => {
    const header = source("src/components/header.tsx");
    // The balance pill (which shows «Пополнить» at zero credits) routes to /wallet.
    expect(header).toContain('href={appUrl("/wallet")}');
    expect(header).not.toContain('href={appUrl("/credits")}');
    const dashboard = source("src/app/cabinet/page.tsx");
    expect(dashboard).not.toContain('appUrl("/credits")');
    expect(dashboard).toContain('appUrl("/wallet")');
  });
});
