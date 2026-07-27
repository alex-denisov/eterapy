import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(filePath: string) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

describe("Z10 — credit wallet and credit packs", () => {
  it("creates credit-pack payments through the existing billing rail", () => {
    // Checkout construction moved into the provider-agnostic layer (B423);
    // the route now only orchestrates auth, velocity limits and telemetry.
    const checkout = source("src/lib/payments/checkout.ts");
    const savedCard = source("src/app/api/billing/pay-with-saved-card/route.ts");

    expect(checkout).toContain("creditPackKey");
    expect(checkout).toContain("creditsAmount");
    expect(checkout).toContain('purchaseKind: purchase.metadata.purchaseKind');
    expect(checkout).toContain("buildBillingReturnUrl");
    expect(savedCard).toContain("creditPackKey");
    expect(savedCard).toContain("creditsAmount");
  });

  it("exposes a guarded cabinet wallet read API with balance, breakdown, packs, and history", () => {
    const routePath = path.join(root, "src/app/api/cabinet/wallet/route.ts");
    expect(fs.existsSync(routePath)).toBe(true);

    const route = fs.readFileSync(routePath, "utf8");
    expect(route).toContain("export async function GET");
    expect(route).toContain("auth()");
    expect(route).toContain("guardClientCabinet");
    expect(route).toContain("getCreditWalletSnapshot");
    expect(route).toContain("breakdown");
    expect(route).toContain("history");
    expect(route).toContain("packs");
  });

  it("builds the wallet snapshot from clarity-credit balance, packs, breakdown, and bounded history", () => {
    const wallet = source("src/lib/credit-wallet.ts");

    expect(wallet).toContain("getClarityCreditBalance");
    expect(wallet).toContain("CREDIT_PACKS");
    expect(wallet).toContain("breakdown");
    expect(wallet).toContain("history");
    expect(wallet).toContain("packs");
    expect(wallet).toContain("take: 50");
    expect(wallet).toContain("expiresAt");
    expect(wallet).toContain("purchase");
    expect(wallet).toContain("subscription");
    expect(wallet).toContain("welcome");
  });

  it("adds a wallet screen with balance, expiry breakdown, credit packs, and history", () => {
    const pagePath = path.join(root, "src/app/cabinet/wallet/page.tsx");
    expect(fs.existsSync(pagePath)).toBe(true);

    const page = fs.readFileSync(pagePath, "utf8");
    expect(page).toContain('data-testid="cabinet-wallet-page"');
    // B602: «Доступно» переименован в WalletAvailable и встал в ряд 2, история
    // объединена в один блок с вкладками «Баллы / Деньги».
    expect(page).toContain("WalletAvailable");
    expect(page).toContain("WalletBreakdown");
    expect(page).toContain("CreditPacksGrid");
    expect(page).toContain("WalletHistoryTabs");
    expect(page).toContain('data-testid={`wallet-pack-${pack.credits}`}');
    expect(page).toContain("creditPackKey");
    expect(page).toContain("CreditPackPurchaseButton");
  });

  it("starts a credit-pack checkout from the wallet with a wallet return path", () => {
    const button = source("src/components/cabinet/credit-pack-purchase-button.tsx");

    expect(button).toContain("/api/billing/create-payment");
    expect(button).toContain("creditPackKey");
    expect(button).toContain('returnPath: "/cabinet/wallet"');
  });

  it("makes wallet an app-visible cabinet route", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");
    const subdomain = source("src/lib/subdomain.ts");

    expect(shell).toContain('appUrl("/wallet")');
    expect(shell).toContain("Кошелёк");
    expect(subdomain).toContain('"/wallet"');
  });
});
