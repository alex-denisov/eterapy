/**
 * B591 фаза 2 — источник строк для книги доходов.
 *
 * Отделён от `ip-income-book.ts` намеренно: там чистые правила признания,
 * которые проверяются тестами без базы, здесь — чтение таблиц.
 *
 * ⚠ В книгу попадают только ДЕНЕЖНЫЕ поступления. `internal` (подписка практика
 *   за счёт заработанного, списание метража AI) и `manual` (выдача админом) —
 *   это внутренние проводки, денег по ним не приходило. Они не выбрасываются
 *   молча: их количество возвращается отдельным числом и показывается на экране.
 */

import db from "@/lib/db";
import { getBillingTransactionMetadata } from "@/lib/entitlements";
import { FISCAL_SETTLEMENT_SUBJECTS, type FiscalSettlementSubject } from "@/lib/payments/fiscal";
import type { IncomeRecord } from "@/lib/ip-income-book";

/**
 * Провайдеры, приход по которым — реальные деньги. Список — данные, а не
 * условие в запросе: появится новая касса, строка добавится сюда.
 *
 * `yukassa` — историческое написание из сессионного рельса (`session-payment`),
 * не опечатка в этом файле.
 */
export const CASH_PROVIDERS: readonly string[] = ["robokassa", "yookassa", "yukassa", "telegram_stars"];

function subjectOf(value: unknown): FiscalSettlementSubject | null {
  return typeof value === "string" && (FISCAL_SETTLEMENT_SUBJECTS as readonly string[]).includes(value)
    ? value as FiscalSettlementSubject
    : null;
}

export interface IncomeRecordsResult {
  records: IncomeRecord[];
  /** Внутренние проводки за период: денег не приходило, в книгу не входят. */
  internalCount: number;
}

export async function loadIncomeRecords(range: { from: Date; to: Date }): Promise<IncomeRecordsResult> {
  const [transactions, internalCount] = await Promise.all([
    db.transaction.findMany({
      where: {
        status: { in: ["SUCCEEDED", "REFUNDED"] },
        provider: { in: [...CASH_PROVIDERS] },
        createdAt: { gte: range.from, lt: range.to },
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        provider: true,
        providerPaymentId: true,
        invoiceId: true,
        description: true,
        metadata: true,
        fiscalReceiptRef: true,
        fiscalReceiptStatus: true,
        fiscalReceiptError: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.transaction.count({
      where: {
        status: { in: ["SUCCEEDED", "REFUNDED"] },
        provider: { notIn: [...CASH_PROVIDERS] },
        createdAt: { gte: range.from, lt: range.to },
      },
    }),
  ]);

  const cash = transactions.filter((transaction) => transaction.amount !== 0);

  // Ставка комиссии живёт на брони, а не на транзакции: она фиксируется в
  // момент сделки и потом может измениться у специалиста.
  const bookingIds = cash
    .map((transaction) => (getBillingTransactionMetadata(transaction) as { bookingId?: string }).bookingId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const bookings = bookingIds.length
    ? await db.booking.findMany({
      where: { id: { in: bookingIds } },
      select: {
        id: true,
        commissionPercentApplied: true,
        practitioner: { select: { commissionPercent: true } },
      },
    })
    : [];
  const commissionByBooking = new Map(
    bookings.map((booking) => [
      booking.id,
      booking.commissionPercentApplied ?? booking.practitioner?.commissionPercent ?? null,
    ]),
  );

  const records = cash.map((transaction): IncomeRecord => {
    const metadata = getBillingTransactionMetadata(transaction) as {
      purchaseKind?: string;
      bookingId?: string;
      starsAmount?: number;
      starsRubRate?: number;
      fiscalReceiptId?: string;
    };
    const subject = subjectOf(metadata.purchaseKind);
    const notes: string[] = [];
    if (metadata.bookingId) notes.push(`бронь ${metadata.bookingId}`);
    if (metadata.starsAmount && metadata.starsRubRate) {
      notes.push(`${metadata.starsAmount} ★ по курсу ${metadata.starsRubRate} ₽ на дату оплаты`);
    }
    if (transaction.description) notes.push(transaction.description);
    if (transaction.fiscalReceiptStatus) notes.push(`чек: ${transaction.fiscalReceiptStatus}`);
    if (transaction.fiscalReceiptError) notes.push(`ошибка чека: ${transaction.fiscalReceiptError}`);

    return {
      id: transaction.id,
      recognizedAt: transaction.createdAt,
      provider: transaction.provider,
      subject,
      // Знак на транзакции означает сторону пользователя (списание/пополнение),
      // а не направление денег: сессия записывается как списание с клиента.
      turnoverKopecks: Math.abs(transaction.amount),
      commissionPercent: metadata.bookingId
        ? commissionByBooking.get(metadata.bookingId) ?? null
        : null,
      refunded: transaction.status === "REFUNDED",
      // Даты возврата на транзакции нет — книга помечает такую строку, а не
      // подставляет дату платежа: база уменьшается ДАТОЙ ВОЗВРАТА.
      refundedAt: null,
      reference: transaction.providerPaymentId ?? String(transaction.invoiceId),
      receiptReference: transaction.fiscalReceiptRef ?? metadata.fiscalReceiptId ?? null,
      note: notes.length ? notes.join(" · ") : null,
    };
  });

  return { records, internalCount };
}
