jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    productEntitlement: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    userSubscription: {
      findMany: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
    },
    creditLedgerEntry: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import db from "@/lib/db";
import { purchaseProductWithBalance } from "@/lib/product-purchase";

type MockedDb = {
  user: { findUnique: jest.Mock; updateMany: jest.Mock };
  productEntitlement: { findFirst: jest.Mock; create: jest.Mock };
  userSubscription: { findMany: jest.Mock };
  transaction: { create: jest.Mock };
  creditLedgerEntry: { create: jest.Mock };
  $transaction: jest.Mock;
};

const mockDb = db as unknown as MockedDb;

function tx() {
  return {
    user: mockDb.user,
    productEntitlement: mockDb.productEntitlement,
    userSubscription: mockDb.userSubscription,
    transaction: mockDb.transaction,
    creditLedgerEntry: mockDb.creditLedgerEntry,
  };
}

describe("purchaseProductWithBalance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.$transaction.mockImplementation((cb: (txClient: ReturnType<typeof tx>) => unknown) => cb(tx()));
  });

  it("debits internal balance, writes a negative transaction, ledger row, and entitlement", async () => {
    mockDb.user.findUnique
      .mockResolvedValueOnce({ balance: 100_000 })
      .mockResolvedValueOnce({ balance: 70_100 });
    mockDb.productEntitlement.findFirst.mockResolvedValueOnce(null);
    mockDb.userSubscription.findMany.mockResolvedValueOnce([]);
    mockDb.user.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.transaction.create.mockResolvedValueOnce({ id: "tx-product" });
    mockDb.productEntitlement.create.mockResolvedValueOnce({ id: "ent-product" });

    const result = await purchaseProductWithBalance({
      userId: "user-1",
      productKey: "perspectives",
      checkoutSource: "test",
    });

    expect(result).toEqual({
      status: "unlocked",
      productKey: "perspectives",
      priceKopecks: 29_900,
      balanceAfterKopecks: 70_100,
      entitlementId: "ent-product",
      transactionId: "tx-product",
    });
    expect(mockDb.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", balance: { gte: 29_900 } },
      data: { balance: { decrement: 29_900 } },
    });
    expect(mockDb.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        amount: -29_900,
        status: "SUCCEEDED",
        provider: "internal",
        metadata: expect.objectContaining({ purchaseKind: "product", productKey: "perspectives" }),
      }),
      select: { id: true },
    });
    expect(mockDb.creditLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        amountKopecks: -29_900,
        balanceAfterKopecks: 70_100,
        type: "PRODUCT_PURCHASE",
        source: "internal_balance",
        transactionId: "tx-product",
      }),
    });
    expect(mockDb.productEntitlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        productKey: "perspectives",
        source: "balance",
        status: "ACTIVE",
        transactionId: "tx-product",
      }),
      select: { id: true },
    });
  });

  it("does not overdraft when the conditional balance decrement fails", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({ balance: 10_000 });
    mockDb.productEntitlement.findFirst.mockResolvedValueOnce(null);
    mockDb.userSubscription.findMany.mockResolvedValueOnce([]);
    mockDb.user.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(purchaseProductWithBalance({
      userId: "user-1",
      productKey: "deep-report",
    })).resolves.toEqual({
      status: "insufficient_balance",
      productKey: "deep-report",
      priceKopecks: 59_000,
      balanceKopecks: 10_000,
    });

    expect(mockDb.transaction.create).not.toHaveBeenCalled();
    expect(mockDb.productEntitlement.create).not.toHaveBeenCalled();
  });

  it("returns already_unlocked for existing entitlement without charging again", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({ balance: 50_000 });
    mockDb.productEntitlement.findFirst.mockResolvedValueOnce({ id: "ent-existing" });

    await expect(purchaseProductWithBalance({
      userId: "user-1",
      productKey: "chat-analysis",
    })).resolves.toEqual({
      status: "already_unlocked",
      productKey: "chat-analysis",
      priceKopecks: 39_000,
      balanceAfterKopecks: 50_000,
    });

    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
  });
});
