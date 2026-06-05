jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    productEntitlement: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    userSubscription: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    creditLedgerEntry: {
      create: jest.fn(),
    },
    clarityCreditLedgerEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import {
  getProductPriceKopecks,
  getProductCreditCost,
  getSubscriptionPlan,
  grantEntitlementForTransaction,
  revokeEntitlementsForTransaction,
  resolveBillingPurchase,
  userHasActiveEntitlement,
} from "@/lib/entitlements";

const mockDb = db as unknown as {
  productEntitlement: {
    findFirst: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  userSubscription: {
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  creditLedgerEntry: { create: jest.Mock };
  clarityCreditLedgerEntry: { findMany: jest.Mock; create: jest.Mock };
};

function tx() {
  return {
    productEntitlement: mockDb.productEntitlement,
    userSubscription: mockDb.userSubscription,
    creditLedgerEntry: { create: jest.fn() },
  } as never;
}

describe("v5 billing entitlements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps product prices server-side", () => {
    expect(getProductPriceKopecks("perspectives")).toBe(29900);
    expect(getProductPriceKopecks("deep-report")).toBe(69000);
    expect(getProductPriceKopecks("chat-analysis")).toBe(39000);
    expect(getProductPriceKopecks("compatibility")).toBe(79000);
    expect(getProductPriceKopecks("seven-days")).toBe(99000);
    // primary-answer was retired in B293; the free dialogue is now /checkin only.
    expect(getProductPriceKopecks("unknown-slug")).toBeNull();
    expect(getProductCreditCost("deep-report")).toBe(4);
    expect(getSubscriptionPlan("plus")).toEqual(expect.objectContaining({
      amountKopecks: 49_000,
      creditsPerPeriod: 12,
    }));
    expect(getSubscriptionPlan("premium")).toEqual(expect.objectContaining({
      amountKopecks: 129_000,
      creditsPerPeriod: 35,
    }));
  });

  it("resolves checkout intent server-side for products and subscriptions (no ₽ balance)", () => {
    // Z1-Ф1: a bare amount (the old ₽ top-up) is no longer a valid purchase.
    expect(() => resolveBillingPurchase({ amountKopecks: 50_000 })).toThrow(
      "Укажите продукт или тариф"
    );
    expect(resolveBillingPurchase({ productKey: "deep-report", amountKopecks: 100 }).amountKopecks).toBe(69_000);
    expect(resolveBillingPurchase({ planKey: "plus" })).toEqual(expect.objectContaining({
      kind: "subscription",
      amountKopecks: 49_000,
    }));
    expect(resolveBillingPurchase({ planKey: "premium" })).toEqual(expect.objectContaining({
      kind: "subscription",
      amountKopecks: 129_000,
    }));
    expect(() => resolveBillingPurchase({ productKey: "deep-report", planKey: "plus" })).toThrow(
      "Нельзя одновременно оплатить продукт и подписку"
    );
  });

  it("keeps product card checkout return URL tied to the originating product flow", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/billing/create-payment/route.ts"), "utf8");
    const controls = fs.readFileSync(path.join(process.cwd(), "src/components/products/product-purchase-controls.tsx"), "utf8");

    expect(controls).toContain("returnPath: currentUrl");
    expect(controls).toContain("/api/billing/reconcile");
    expect(controls).toContain("/api/billing/entitlements?productKey=");
    expect(controls).toContain('paymentStatus !== "success"');
    expect(route).toContain("returnPath");
    expect(route).toContain("buildBillingReturnUrl");
    expect(route).not.toContain('const returnUrl = `${baseUrl}/cabinet/billing?payment=success`;');
  });

  it("grants subscription clarity credits when a paid subscription transaction succeeds", async () => {
    mockDb.userSubscription.create.mockResolvedValueOnce({ id: "sub-1" });
    mockDb.creditLedgerEntry.create.mockResolvedValueOnce({ id: "ledger-charge" });
    mockDb.clarityCreditLedgerEntry = {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "clarity-grant", balanceAfter: 10 }),
    };

    const result = await grantEntitlementForTransaction(mockDb as never, {
      id: "tx-sub",
      userId: "user-1",
      amount: 49000,
      description: "ETerapy Plus",
      metadata: { purchaseKind: "subscription", planKey: "plus" },
    });

    expect(result).toEqual({ kind: "subscription", planKey: "plus" });
    expect(mockDb.clarityCreditLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        amount: 12,
        type: "grant",
        source: "subscription",
        sourceEventId: "tx-sub",
      }),
    }));
  });

  it("grants product entitlement from a paid transaction without touching UI state", async () => {
    mockDb.productEntitlement.findFirst.mockResolvedValueOnce(null);
    const transaction = {
      id: "tx-1",
      userId: "user-1",
      amount: 69000,
      description: "ETerapy: deep-report",
      metadata: { purchaseKind: "product", productKey: "deep-report" },
    };

    const result = await grantEntitlementForTransaction(tx(), transaction as never);

    expect(result).toEqual({ kind: "product", productKey: "deep-report" });
    expect(mockDb.productEntitlement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        productKey: "deep-report",
        status: "ACTIVE",
        transactionId: "tx-1",
      }),
    }));
  });

  it("uses active subscription inclusions when checking access", async () => {
    mockDb.productEntitlement.findFirst.mockResolvedValueOnce(null);
    mockDb.userSubscription.findMany.mockResolvedValueOnce([{ planKey: "plus" }]);

    await expect(userHasActiveEntitlement("user-1", "perspectives")).resolves.toBe(true);

    mockDb.productEntitlement.findFirst.mockResolvedValueOnce(null);
    mockDb.userSubscription.findMany.mockResolvedValueOnce([{ planKey: "plus" }]);
    await expect(userHasActiveEntitlement("user-1", "chat-analysis")).resolves.toBe(false);

    mockDb.productEntitlement.findFirst.mockResolvedValueOnce(null);
    mockDb.userSubscription.findMany.mockResolvedValueOnce([{ planKey: "premium" }]);
    await expect(userHasActiveEntitlement("user-1", "deep-report")).resolves.toBe(true);
  });

  it("revokes product entitlements and records a refund ledger entry", async () => {
    const ledgerCreate = jest.fn();
    const testTx = {
      productEntitlement: mockDb.productEntitlement,
      userSubscription: mockDb.userSubscription,
      creditLedgerEntry: { create: ledgerCreate },
    } as never;
    const transaction = {
      id: "tx-1",
      userId: "user-1",
      amount: 69000,
      description: "ETerapy: deep-report",
      metadata: { purchaseKind: "product", productKey: "deep-report" },
    };

    await revokeEntitlementsForTransaction(testTx, transaction as never, "Возврат по обращению клиента");

    expect(mockDb.productEntitlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        productKey: "deep-report",
        transactionId: "tx-1",
        status: "ACTIVE",
      }),
      data: expect.objectContaining({
        status: "REFUNDED",
        revokedAt: expect.any(Date),
      }),
    }));
    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amountKopecks: 69000,
        type: "REFUND",
        source: "yookassa_refund",
        transactionId: "tx-1",
      }),
    }));
  });
});
