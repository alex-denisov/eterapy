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
  },
}));

import db from "@/lib/db";
import {
  getProductPriceKopecks,
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
    expect(getProductPriceKopecks("deep-report")).toBe(99000);
    expect(getProductPriceKopecks("primary-answer")).toBeNull();
    expect(getSubscriptionPlan("plus")?.includedProducts).toContain("deep-report");
  });

  it("resolves checkout intent server-side for balance, products, and subscriptions", () => {
    expect(resolveBillingPurchase({ amountKopecks: 50_000 }).metadata).toEqual({
      purchaseKind: "balance",
      checkoutSource: undefined,
    });
    expect(resolveBillingPurchase({ productKey: "deep-report", amountKopecks: 100 }).amountKopecks).toBe(99_000);
    expect(resolveBillingPurchase({ planKey: "plus" })).toEqual(expect.objectContaining({
      kind: "subscription",
      amountKopecks: 299_000,
    }));
    expect(() => resolveBillingPurchase({ productKey: "deep-report", planKey: "plus" })).toThrow(
      "Нельзя одновременно оплатить продукт и подписку"
    );
  });

  it("grants product entitlement from a paid transaction without touching UI state", async () => {
    mockDb.productEntitlement.findFirst.mockResolvedValueOnce(null);
    const transaction = {
      id: "tx-1",
      userId: "user-1",
      amount: 99000,
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

    await expect(userHasActiveEntitlement("user-1", "deep-report")).resolves.toBe(true);
    await expect(userHasActiveEntitlement("user-1", "chat-analysis")).resolves.toBe(false);
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
      amount: 99000,
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
        amountKopecks: 99000,
        type: "REFUND",
        source: "yookassa_refund",
        transactionId: "tx-1",
      }),
    }));
  });
});
