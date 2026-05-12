/**
 * GET /api/billing/transactions
 * Возвращает историю транзакций пользователя.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const transactions = await db.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const ledger = await db.creditLedgerEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
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
