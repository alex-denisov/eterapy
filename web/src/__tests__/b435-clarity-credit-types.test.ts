import fs from "node:fs";
import path from "node:path";
import {
  allocateClarityCreditSpendFromLots,
  classifyClarityCreditSource,
  CLARITY_CREDIT_POINT_RULES,
} from "@/lib/clarity-credits";
import { creditExpiryFor } from "@/lib/credit-expiry";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B435 clarity credit point types and burn priority", () => {
  const now = new Date("2026-06-18T09:00:00.000Z");

  it("formalizes the four legal point types and their expiry rules", () => {
    expect(Object.keys(CLARITY_CREDIT_POINT_RULES).sort()).toEqual([
      "compensation_points",
      "promo_points",
      "purchased_points",
      "subscription_points",
    ]);

    expect(classifyClarityCreditSource("purchase")).toBe("purchased_points");
    expect(classifyClarityCreditSource("subscription")).toBe("subscription_points");
    expect(classifyClarityCreditSource("welcome")).toBe("promo_points");
    expect(classifyClarityCreditSource("referral")).toBe("promo_points");
    expect(classifyClarityCreditSource("mission")).toBe("promo_points");
    expect(classifyClarityCreditSource("daily_practice")).toBe("promo_points");
    expect(classifyClarityCreditSource("streak")).toBe("promo_points");
    expect(classifyClarityCreditSource("admin")).toBe("compensation_points");

    const periodEnd = new Date("2026-07-18T09:00:00.000Z");
    expect(creditExpiryFor("subscription", now, periodEnd)).toEqual(periodEnd);
    expect(creditExpiryFor("purchase", now)).toBeNull();
    expect(creditExpiryFor("welcome", now)).toEqual(new Date("2026-07-02T09:00:00.000Z"));
    expect(creditExpiryFor("admin", now)).toBeNull();
  });

  it("spends expiring points first, then purchased points", () => {
    const result = allocateClarityCreditSpendFromLots([
      { source: "purchase", amount: 10, expiresAt: null },
      { source: "subscription", amount: 2, expiresAt: new Date("2026-07-18T09:00:00.000Z") },
      { source: "welcome", amount: 3, expiresAt: new Date("2026-06-25T09:00:00.000Z") },
      { source: "admin", amount: 4, expiresAt: null },
    ], 7, now);

    expect(result.ok).toBe(true);
    expect(result.allocations).toEqual([
      { source: "welcome", amount: 3, expiresAt: "2026-06-25T09:00:00.000Z", pointType: "promo_points" },
      { source: "subscription", amount: 2, expiresAt: "2026-07-18T09:00:00.000Z", pointType: "subscription_points" },
      { source: "purchase", amount: 2, expiresAt: null, pointType: "purchased_points" },
    ]);
  });

  it("records spend allocations and shows type/expiry rules in wallet and purchase surfaces", () => {
    const spendRoute = source("src/app/api/billing/spend-credits/route.ts");
    const wallet = source("src/lib/credit-wallet.ts");
    const walletPage = source("src/app/cabinet/wallet/page.tsx");
    const billingPage = source("src/components/cabinet/billing-panel.tsx");

    expect(spendRoute).toContain("planClarityCreditSpend");
    expect(spendRoute).toContain("allocations");
    expect(wallet).toContain("pointTypeLabel");
    expect(wallet).toContain("buildOpenClarityCreditLots");
    expect(walletPage).toContain("item.pointTypeLabel");
    expect(walletPage).toContain("Подписочные баллы сгорают в конце оплаченного периода");
    expect(billingPage).toContain("Подписочные баллы сгорают в конце периода");
  });
});
