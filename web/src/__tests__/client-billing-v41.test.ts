import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B206 client billing v4.1 cabinet", () => {
  it("surfaces subscription status, balance, cards, and billing history from live APIs", () => {
    const page = source("src/app/cabinet/billing/page.tsx");
    const creditsPage = source("src/app/cabinet/wallet/page.tsx");
    const transactionsRoute = source("src/app/api/billing/transactions/route.ts");
    const entitlementsRoute = source("src/app/api/billing/entitlements/route.ts");

    expect(page).toContain('data-testid="client-billing-subscription"');
    expect(page).toContain('data-testid="client-saved-cards"');
    expect(page).toContain('data-testid="client-billing-history"');
    expect(page).toContain("fetch(\"/api/billing/entitlements\")");
    expect(page).toContain("fetch(\"/api/billing/transactions\")");
    expect(page).toContain("fetch(\"/api/billing/cards\")");
    // Z1-Ф1: the client ₽ balance rail is removed — no balance fetch/display.
    expect(page).not.toContain("fetch(\"/api/billing/balance\")");
    // T21: "открытые продукты" entitlements block was removed from billing.
    expect(page).not.toContain('data-testid="client-open-entitlements"');
    // Credits live on their own page (B235: credits moved out of billing)
    expect(creditsPage).toContain('data-testid="cabinet-wallet-page"');
    expect(creditsPage).toContain("getCreditWalletSnapshot");
    expect(transactionsRoute).toContain("clarityCredits");
    expect(entitlementsRoute).toContain("listUserEntitlements");
  });

  it("T21/Z1-Ф1: billing manages cards + subscription, no ₽ top-up, unified history table", () => {
    const page = source("src/app/cabinet/billing/page.tsx");
    const table = source("src/components/cabinet/billing-history-table.tsx");
    const cardsRoute = source("src/app/api/billing/cards/route.ts");

    // Z1-Ф1: the client ₽ balance rail (top-up input) is removed — billing is
    // subscription + saved-card management only.
    expect(page).not.toContain('data-testid="client-topup-amount"');
    expect(page).not.toContain('data-testid="client-wallet-balance"');
    // Баг 8: subscriptions ARE paid one-tap via the saved card.
    expect(page).toContain("/api/billing/pay-with-saved-card");
    // Saved cards rendered as visual faces with set-primary action.
    expect(page).toContain("async function handleSetDefaultCard");
    expect(page).toContain('data-testid="client-set-default-card"');
    expect(page).toContain('action: "set_default"');
    // Dead stepper chips removed.
    expect(page).not.toContain('"1. Проверка"');
    // Unified deposits + spends history table.
    expect(page).toContain("<BillingHistoryTable");
    expect(table).toContain("client-billing-history-table");
    expect(table).toContain("billing-history-search");
    expect(table).toContain("billing-history-sort");
    // PATCH set_default handler exists on the cards API.
    expect(cardsRoute).toContain("export async function PATCH");
    expect(cardsRoute).toContain("set_default");
  });

  it("makes plan upgrade and cancellation controls actionable instead of decorative", () => {
    const page = source("src/app/cabinet/billing/page.tsx");
    const subscriptionsRoute = source("src/app/api/billing/subscriptions/route.ts");

    expect(page).toContain("async function handleStartSubscription");
    expect(page).toContain("planKey, checkoutSource: \"client_billing\"");
    expect(page).toContain("async function handleCancelSubscription");
    expect(page).toContain("fetch(\"/api/billing/subscriptions\"");
    expect(page).toContain("action: \"cancel_at_period_end\"");
    expect(page).toContain("getSubscriptionPlanLabel");
    expect(page).toContain("getSubscriptionStatusLabel");
    expect(subscriptionsRoute).toContain("cancel_at_period_end");
  });

  it("preserves selected billing plan through the protected login redirect", () => {
    const proxy = source("src/proxy.ts");
    const login = source("src/app/(auth)/login/page.tsx");

    expect(proxy).toContain("function encodedNext");
    expect(proxy).toContain("encodedNext(pathname, request.nextUrl.search)");
    expect(proxy).toContain("encodedNext(nextPath, request.nextUrl.search)");
    expect(login).toContain("const nextPath = getSafeRedirectPath(searchParams.get(\"next\"))");
    expect(login).toContain("nextPath ?? homePathForRole(\"CLIENT\")");
  });
});
