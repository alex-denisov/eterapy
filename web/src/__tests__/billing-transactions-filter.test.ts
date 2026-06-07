/**
 * Z1-Ф2 cleanup: the client billing history must not surface legacy ₽-balance
 * artifacts (the removed wallet rail) — pre-Z1 top-up `Transaction` rows
 * (purchaseKind "balance") and money-ledger TOPUP / BALANCE_REFUND entries.
 * Card payments for products/subscriptions/packs and the clarity-credit ledger
 * still appear.
 */
import { GET } from "@/app/api/billing/transactions/route";

jest.mock("@/lib/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    transaction: { findMany: jest.fn() },
    creditLedgerEntry: { findMany: jest.fn() },
    clarityCreditLedgerEntry: { findMany: jest.fn() },
  },
}));

import { auth } from "@/lib/auth";
import db from "@/lib/db";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as unknown as {
  transaction: { findMany: jest.Mock };
  creditLedgerEntry: { findMany: jest.Mock };
  clarityCreditLedgerEntry: { findMany: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
  mockDb.clarityCreditLedgerEntry.findMany.mockResolvedValue([]);
});

describe("GET /api/billing/transactions — legacy ₽-balance is hidden", () => {
  it("drops legacy balance top-up transactions, keeps product/subscription/credits", async () => {
    mockDb.transaction.findMany.mockResolvedValueOnce([
      { id: "t-balance", amount: 50000, currency: "RUB", status: "SUCCEEDED", provider: "yookassa", description: "Пополнение баланса на сайте ETerapy", createdAt: new Date(), metadata: { purchaseKind: "balance" } },
      { id: "t-product", amount: 69000, currency: "RUB", status: "SUCCEEDED", provider: "yookassa", description: "ETerapy: deep-report", createdAt: new Date(), metadata: { purchaseKind: "product", productKey: "deep-report" } },
      { id: "t-sub", amount: 129000, currency: "RUB", status: "SUCCEEDED", provider: "yookassa", description: "ETerapy Premium", createdAt: new Date(), metadata: { purchaseKind: "subscription", planKey: "premium" } },
      { id: "t-credits", amount: 24900, currency: "RUB", status: "SUCCEEDED", provider: "yookassa", description: "5 кредитов", createdAt: new Date(), metadata: { purchaseKind: "credits", creditPackKey: "pack-5" } },
    ]);
    mockDb.creditLedgerEntry.findMany.mockResolvedValueOnce([]);

    const res = await GET();
    const body = await res.json();
    const ids = body.transactions.map((t: { id: string }) => t.id);

    expect(ids).not.toContain("t-balance");
    expect(ids).toEqual(["t-product", "t-sub", "t-credits"]);
  });

  it("drops TOPUP / BALANCE_REFUND ledger rows, keeps real purchase debits", async () => {
    mockDb.transaction.findMany.mockResolvedValueOnce([]);
    mockDb.creditLedgerEntry.findMany.mockResolvedValueOnce([
      { id: "l-topup", amountKopecks: 50000, balanceAfterKopecks: 50000, type: "TOPUP", source: "yookassa", transactionId: null, description: "Пополнение", createdAt: new Date() },
      { id: "l-refund", amountKopecks: -50000, balanceAfterKopecks: 0, type: "BALANCE_REFUND", source: "yookassa_refund", transactionId: null, description: "Возврат", createdAt: new Date() },
      { id: "l-product", amountKopecks: -69000, balanceAfterKopecks: null, type: "PRODUCT_PURCHASE", source: "yookassa", transactionId: "t-product", description: "deep-report", createdAt: new Date() },
      { id: "l-sub", amountKopecks: -129000, balanceAfterKopecks: null, type: "SUBSCRIPTION_CHARGE", source: "yookassa", transactionId: "t-sub", description: "Premium", createdAt: new Date() },
    ]);

    const res = await GET();
    const body = await res.json();
    const ids = body.ledger.map((e: { id: string }) => e.id);

    expect(ids).not.toContain("l-topup");
    expect(ids).not.toContain("l-refund");
    expect(ids).toEqual(["l-product", "l-sub"]);
  });

  it("401s without a session", async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
