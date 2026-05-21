import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B206 client billing v4.1 cabinet", () => {
  it("surfaces subscription status, balance, cards, entitlements, and billing history from live APIs", () => {
    const page = source("src/app/cabinet/billing/page.tsx");
    const creditsPage = source("src/app/cabinet/credits/page.tsx");
    const transactionsRoute = source("src/app/api/billing/transactions/route.ts");
    const entitlementsRoute = source("src/app/api/billing/entitlements/route.ts");

    expect(page).toContain('data-testid="client-billing-subscription"');
    expect(page).toContain('data-testid="client-saved-cards"');
    expect(page).toContain('data-testid="client-open-entitlements"');
    expect(page).toContain('data-testid="client-billing-history"');
    expect(page).toContain("fetch(\"/api/billing/entitlements\")");
    expect(page).toContain("fetch(\"/api/billing/transactions\")");
    expect(page).toContain("fetch(\"/api/billing/cards\")");
    expect(page).toContain("fetch(\"/api/billing/balance\")");
    // Credits live on their own page (B235: credits moved out of billing)
    expect(creditsPage).toContain('data-testid="cabinet-credits-page"');
    expect(creditsPage).toContain("getClarityCreditBalance");
    expect(transactionsRoute).toContain("clarityCredits");
    expect(entitlementsRoute).toContain("listUserEntitlements");
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
