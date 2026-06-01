import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Practitioner subscription balance flow", () => {
  it("adds a dedicated practitioner subscription page instead of client billing", () => {
    const page = source("src/app/cabinet/practitioner/subscription/page.tsx");
    const client = source("src/app/cabinet/practitioner/subscription/subscription-client.tsx");
    expect(page).toContain("Подписка практика");
    expect(page).toContain("PractitionerSubscriptionClient");
    expect(client).toContain("/api/practitioner/subscriptions/start-from-earnings");
    expect(client).toContain("practitioner-subscribe-from-earnings");
    expect(client).toContain("checkoutSource: \"practitioner_subscription_card\"");
  });

  it("deducts internal subscription charges from practitioner earnings balance", () => {
    const balance = source("src/lib/practitioner-balance.ts");
    expect(balance).toContain("internalCharges");
    expect(balance).toContain("practitioner_earnings_balance");
    expect(balance).toContain("currentBalance = accruedNet - paidOut - pendingPayout - internalCharges");
  });
});
