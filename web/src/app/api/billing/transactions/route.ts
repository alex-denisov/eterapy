/**
 * GET /api/billing/transactions
 * Возвращает историю транзакций пользователя.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

// Z1-Ф2: the client ₽ balance rail is removed. Legacy top-up artifacts (real
// pre-Z1 `Transaction` rows with `purchaseKind: "balance"` and the money-ledger
// TOPUP / BALANCE_REFUND entries) must not surface in billing history — they
// reference a concept that no longer exists. Card payments for products /
// subscriptions / credit packs and the clarity-credit ledger remain.
const LEGACY_BALANCE_LEDGER_TYPES = new Set(["TOPUP", "BALANCE_REFUND"]);

function isLegacyBalanceTopup(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).purchaseKind === "balance";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const transactionsRaw = await db.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const transactions = transactionsRaw.filter((t) => !isLegacyBalanceTopup(t.metadata));
  const ledgerRaw = await db.creditLedgerEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const ledger = ledgerRaw.filter((entry) => !LEGACY_BALANCE_LEDGER_TYPES.has(entry.type));
  const clarityCredits = await db.clarityCreditLedgerEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    transactions: transactions.map((t) => ({
      id: t.id,
      amountKopecks: t.amount,
      amountRub: (t.amount / 100).toFixed(2),
      currency: t.currency,
      status: t.status,
      provider: t.provider,
      description: t.description,
      createdAt: t.createdAt,
      metadata: t.metadata,
    })),
    ledger: ledger.map((entry) => ({
      id: entry.id,
      amountKopecks: entry.amountKopecks,
      amountRub: (entry.amountKopecks / 100).toFixed(2),
      balanceAfterKopecks: entry.balanceAfterKopecks,
      type: entry.type,
      source: entry.source,
      transactionId: entry.transactionId,
      description: entry.description,
      createdAt: entry.createdAt,
    })),
    clarityCredits: clarityCredits.map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      type: entry.type,
      source: entry.source,
      sourceEventId: entry.sourceEventId,
      status: entry.status,
      expiresAt: entry.expiresAt,
      createdAt: entry.createdAt,
    })),
  });
}
