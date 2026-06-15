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
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import {
  CREDIT_PACKS,
  V5_BUNDLE_CONTENTS,
  consumeProductEntitlementForUse,
  getProductCreditCost,
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
  creditLedgerEntry: { create: jest.Mock };
  clarityCreditLedgerEntry: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
};

function tx() {
  return {
    productEntitlement: mockDb.productEntitlement,
    userSubscription: mockDb.userSubscription,
    creditLedgerEntry: { create: jest.fn() },
    clarityCreditLedgerEntry: mockDb.clarityCreditLedgerEntry,
  } as never;
}

describe("v5 billing entitlements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps product prices server-side", () => {
    // B366: consistent ~297 ₽/балл ladder (1=299·2=590·3=890·4=1090 ₽ bundle).
    expect(getProductPriceKopecks("perspectives")).toBe(29900);
    expect(getProductPriceKopecks("deep-report")).toBe(89000);
    expect(getProductPriceKopecks("full-question")).toBe(109000);
    expect(getProductPriceKopecks("chat-analysis")).toBe(59000);
    expect(getProductPriceKopecks("compatibility")).toBe(89000);
    expect(getProductPriceKopecks("tarot")).toBe(59000);
    // primary-answer was retired in B293; the free dialogue is now /checkin only.
    expect(getProductPriceKopecks("unknown-slug")).toBeNull();
    expect(getProductCreditCost("deep-report")).toBe(3);
    expect(getProductCreditCost("full-question")).toBe(4);
    expect(V5_BUNDLE_CONTENTS["full-question"]).toEqual(["perspectives", "deep-report"]);
    expect(getSubscriptionPlan("plus")).toEqual(expect.objectContaining({
      amountKopecks: 49_000,
      creditsPerPeriod: 12,
    }));
    expect(getSubscriptionPlan("premium")).toEqual(expect.objectContaining({
      amountKopecks: 129_000,
      creditsPerPeriod: 35,
    }));
    expect(CREDIT_PACKS["pack-5"]).toEqual(expect.objectContaining({ amountKopecks: 24_900, credits: 5 }));
    expect(CREDIT_PACKS["pack-10"]).toEqual(expect.objectContaining({ amountKopecks: 44_900, credits: 10 }));
    expect(CREDIT_PACKS["pack-25"]).toEqual(expect.objectContaining({ amountKopecks: 99_000, credits: 25 }));
  });

  it("resolves checkout intent server-side for products, subscriptions, and credit packs (no ₽ balance)", () => {
    // Z1-Ф1: a bare amount (the old ₽ top-up) is no longer a valid purchase.
    expect(() => resolveBillingPurchase({ amountKopecks: 50_000 })).toThrow(
      "Укажите продукт, тариф или пакет баллов"
    );
    expect(resolveBillingPurchase({ productKey: "deep-report", amountKopecks: 100 }).amountKopecks).toBe(89_000);
    expect(resolveBillingPurchase({ productKey: "full-question" })).toEqual(expect.objectContaining({
      kind: "product",
      amountKopecks: 109_000,
      description: "ETerapy: full-question",
      metadata: expect.objectContaining({ purchaseKind: "product", productKey: "full-question" }),
    }));
    expect(resolveBillingPurchase({ planKey: "plus" })).toEqual(expect.objectContaining({
      kind: "subscription",
      amountKopecks: 49_000,
    }));
    expect(resolveBillingPurchase({ planKey: "premium" })).toEqual(expect.objectContaining({
      kind: "subscription",
      amountKopecks: 129_000,
    }));
    expect(() => resolveBillingPurchase({ productKey: "deep-report", planKey: "plus" })).toThrow(
      "Нельзя одновременно оплатить несколько типов покупки"
    );
    expect(() => resolveBillingPurchase({ productKey: "deep-report", creditPackKey: "pack-10" })).toThrow(
      "Нельзя одновременно оплатить несколько типов покупки"
    );
    expect(resolveBillingPurchase({ creditPackKey: "pack-10", returnPath: "/cabinet/wallet" })).toEqual(expect.objectContaining({
      kind: "credits",
      amountKopecks: 44_900,
      description: "Баллы, 10 шт.",
      metadata: expect.objectContaining({
        purchaseKind: "credits",
        creditPackKey: "pack-10",
        creditsAmount: 10,
        returnPath: "/cabinet/wallet",
      }),
    }));
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
      findFirst: jest.fn(),
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

  it("grants a purchased credit pack idempotently into clarity credits", async () => {
    mockDb.clarityCreditLedgerEntry.findFirst.mockResolvedValueOnce(null);
    mockDb.clarityCreditLedgerEntry.findMany.mockResolvedValueOnce([]);
    mockDb.clarityCreditLedgerEntry.create.mockResolvedValueOnce({ id: "pack-grant", balanceAfter: 10 });
    const ledgerCreate = jest.fn();
    const testTx = {
      productEntitlement: mockDb.productEntitlement,
      userSubscription: mockDb.userSubscription,
      creditLedgerEntry: { create: ledgerCreate },
      clarityCreditLedgerEntry: mockDb.clarityCreditLedgerEntry,
    } as never;

    const result = await grantEntitlementForTransaction(testTx, {
      id: "tx-pack",
      userId: "user-1",
      amount: 44900,
      description: "Баллы, 10 шт.",
      metadata: { purchaseKind: "credits", creditPackKey: "pack-10", creditsAmount: 10 },
    });

    expect(result).toEqual({ kind: "credits", creditPackKey: "pack-10", credits: 10 });
    expect(mockDb.clarityCreditLedgerEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        type: "grant",
        source: "purchase",
        sourceEventId: "tx-pack",
      }),
    }));
    expect(mockDb.clarityCreditLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        amount: 10,
        type: "grant",
        source: "purchase",
        sourceEventId: "tx-pack",
        status: "confirmed",
        expiresAt: null,
      }),
    }));
    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amountKopecks: -44900,
        type: "CREDIT_PACK_PURCHASE",
        transactionId: "tx-pack",
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

  it("expands the full-question bundle into perspectives and deep-report entitlements", async () => {
    mockDb.productEntitlement.findFirst.mockResolvedValue(null);
    const ledgerCreate = jest.fn();
    const testTx = {
      productEntitlement: mockDb.productEntitlement,
      userSubscription: mockDb.userSubscription,
      creditLedgerEntry: { create: ledgerCreate },
      clarityCreditLedgerEntry: mockDb.clarityCreditLedgerEntry,
    } as never;

    const result = await grantEntitlementForTransaction(testTx, {
      id: "tx-bundle",
      userId: "user-1",
      amount: 89000,
      description: "ETerapy: full-question",
      metadata: { purchaseKind: "product", productKey: "full-question" },
    });

    expect(result).toEqual({
      kind: "bundle",
      bundleKey: "full-question",
      productKeys: ["perspectives", "deep-report"],
    });
    expect(mockDb.productEntitlement.create).toHaveBeenCalledTimes(2);
    expect(mockDb.productEntitlement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        productKey: "perspectives",
        source: "bundle",
        transactionId: "tx-bundle",
      }),
    }));
    expect(mockDb.productEntitlement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        productKey: "deep-report",
        source: "bundle",
        transactionId: "tx-bundle",
      }),
    }));
    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amountKopecks: -89000,
        type: "PRODUCT_PURCHASE",
        transactionId: "tx-bundle",
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

    mockDb.productEntitlement.findFirst.mockResolvedValueOnce(null);
    mockDb.userSubscription.findMany.mockResolvedValueOnce([{ planKey: "plus" }, { planKey: "deep" }]);
    await expect(userHasActiveEntitlement("user-1", "chat-analysis")).resolves.toBe(true);
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

  it("revokes both full-question bundle entitlements on refund", async () => {
    const ledgerCreate = jest.fn();
    const testTx = {
      productEntitlement: mockDb.productEntitlement,
      userSubscription: mockDb.userSubscription,
      creditLedgerEntry: { create: ledgerCreate },
      clarityCreditLedgerEntry: mockDb.clarityCreditLedgerEntry,
    } as never;

    await revokeEntitlementsForTransaction(testTx, {
      id: "tx-bundle",
      userId: "user-1",
      amount: 89000,
      description: "ETerapy: full-question",
      metadata: { purchaseKind: "product", productKey: "full-question" },
    } as never, "Возврат бандла");

    expect(mockDb.productEntitlement.updateMany).toHaveBeenCalledTimes(2);
    expect(mockDb.productEntitlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        productKey: "perspectives",
        transactionId: "tx-bundle",
        status: "ACTIVE",
      }),
    }));
    expect(mockDb.productEntitlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        productKey: "deep-report",
        transactionId: "tx-bundle",
        status: "ACTIVE",
      }),
    }));
    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amountKopecks: 89000,
        type: "REFUND",
        source: "yookassa_refund",
        transactionId: "tx-bundle",
      }),
    }));
  });

  it("revokes purchased credit packs with an idempotent clawback", async () => {
    mockDb.clarityCreditLedgerEntry.findFirst.mockResolvedValueOnce(null);
    mockDb.clarityCreditLedgerEntry.findMany.mockResolvedValueOnce([{ amount: 10, expiresAt: null }]);
    mockDb.clarityCreditLedgerEntry.create.mockResolvedValueOnce({ id: "pack-clawback", balanceAfter: 0 });
    const ledgerCreate = jest.fn();
    const testTx = {
      productEntitlement: mockDb.productEntitlement,
      userSubscription: mockDb.userSubscription,
      creditLedgerEntry: { create: ledgerCreate },
      clarityCreditLedgerEntry: mockDb.clarityCreditLedgerEntry,
    } as never;

    await revokeEntitlementsForTransaction(testTx, {
      id: "tx-pack",
      userId: "user-1",
      amount: 44900,
      description: "Баллы, 10 шт.",
      metadata: { purchaseKind: "credits", creditPackKey: "pack-10", creditsAmount: 10 },
    } as never, "Возврат по обращению клиента");

    expect(mockDb.clarityCreditLedgerEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        type: "clawback",
        source: "purchase",
        sourceEventId: "tx-pack",
      }),
    }));
    expect(mockDb.clarityCreditLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        amount: -10,
        type: "clawback",
        source: "purchase",
        sourceEventId: "tx-pack",
        status: "confirmed",
      }),
    }));
    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amountKopecks: 44900,
        type: "REFUND",
        source: "yookassa_refund",
        transactionId: "tx-pack",
      }),
    }));
  });
});

describe("INC-025/B408 consumeProductEntitlementForUse (per-use billing)", () => {
  type TxArg = Parameters<typeof consumeProductEntitlementForUse>[0];

  it("marks the active direct entitlement CONSUMED so the next разбор re-charges", async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      productEntitlement: {
        findFirst: jest.fn().mockResolvedValue({ id: "ent-1" }),
        update,
      },
    } as unknown as TxArg;

    const consumed = await consumeProductEntitlementForUse(tx, "user-1", "chat-analysis");

    expect(consumed).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ent-1" },
      data: expect.objectContaining({ status: "CONSUMED" }),
    }));
  });

  it("is a no-op for subscription users (no direct entitlement row to consume)", async () => {
    const update = jest.fn();
    const tx = {
      productEntitlement: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    } as unknown as TxArg;

    const consumed = await consumeProductEntitlementForUse(tx, "subscriber-1", "perspectives");

    expect(consumed).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("chat-analysis generate consumes the entitlement in the same transaction", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/products/chat-analysis/route.ts"),
      "utf8",
    );
    expect(route).toContain("consumeProductEntitlementForUse");
    expect(route).toContain("db.$transaction");
  });

  it("consumes the most-recent ACTIVE direct entitlement (so an older row is never picked first)", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: "newest-ent" });
    const update = jest.fn().mockResolvedValue({});
    const tx = { productEntitlement: { findFirst, update } } as unknown as TxArg;

    await consumeProductEntitlementForUse(tx, "user-1", "perspectives");

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-1", productKey: "perspectives", status: "ACTIVE" }),
      orderBy: { createdAt: "desc" },
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "newest-ent" },
      data: expect.objectContaining({ status: "CONSUMED", consumedAt: expect.any(Date) }),
    }));
  });

  // B408 Phase 2: every entitlement-gated paid generate path must consume the
  // unlock on the paid branch, inside the result-save transaction — so a second
  // разбор re-charges (digital products are per-use, not buy-once-regenerate-free).
  it("all entitlement-gated paid generate routes consume on the paid path", () => {
    const routes = [
      "src/app/api/products/perspectives/route.ts",
      "src/app/api/products/deep-report/route.ts",
      "src/app/api/products/symbolic/route.ts",
      "src/app/api/products/synastry/route.ts",
      "src/app/api/products/circle/[id]/generate/route.ts",
      "src/app/api/products/compatibility/[id]/generate/route.ts",
    ];
    for (const rel of routes) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).toContain("consumeProductEntitlementForUse");
      expect(src).toContain("db.$transaction");
    }
  });

  // The create/invite-only steps never generate a paid result, so they must NOT
  // consume — consuming there would burn the unlock before the report exists.
  it("create/invite-only routes never consume an entitlement", () => {
    const routes = [
      "src/app/api/products/circle/route.ts",
      "src/app/api/products/compatibility/route.ts",
    ];
    for (const rel of routes) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).not.toContain("consumeProductEntitlementForUse");
    }
  });
});
