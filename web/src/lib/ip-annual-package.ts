/**
 * B591 фаза 4 — годовой пакет для бухгалтера.
 *
 * Одной кнопкой: доходы по месяцам, реестр чеков, реестр возвратов, разбивка
 * оборот/комиссия и календарь сроков. Файл, который владелец пересылает в
 * Альфу, — не декларация и не КУДиР.
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНО ОТ КНИГИ ДОХОДОВ. Книга — построчный журнал: она отвечает
 * на вопрос «откуда эта сумма». Годовой пакет отвечает на другой вопрос —
 * «сходится ли год»: помесячная динамика, чеки, возвраты и доля комиссии.
 * Бухгалтеру нужны оба, и склеивать их в одну простыню значит потерять оба.
 *
 * ЧИСТЫЙ МОДУЛЬ. Никакой базы: на вход — уже собранные строки книги доходов,
 * на выход — листы будущего файла. Это позволяет проверить арифметику прогоном,
 * а не глазами по выгрузке.
 */

import type { IncomeBookEntry } from "@/lib/ip-income-book";
import { RECOGNITION_LABEL, SUBJECT_LABEL } from "@/lib/ip-income-book";

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
] as const;

export interface AnnualMonthRow {
  month: string;
  turnoverKopecks: number;
  ownIncomeKopecks: number;
  refundedOwnIncomeKopecks: number;
  payments: number;
  withReceipt: number;
}

export interface AnnualSubjectRow {
  subject: string;
  turnoverKopecks: number;
  ownIncomeKopecks: number;
  payments: number;
}

export interface AnnualPackage {
  year: number;
  months: AnnualMonthRow[];
  subjects: AnnualSubjectRow[];
  receipts: IncomeBookEntry[];
  missingReceipts: IncomeBookEntry[];
  refunds: IncomeBookEntry[];
  totals: {
    turnoverKopecks: number;
    ownIncomeKopecks: number;
    refundedOwnIncomeKopecks: number;
    payments: number;
    withReceipt: number;
    /** Доля собственного дохода в обороте, проценты. Пустой год даёт 0, а не NaN. */
    ownIncomeSharePercent: number;
  };
}

function monthIndexMsk(date: Date): number {
  // Признание идёт кассовым методом по московской дате: платёж 31 декабря
  // 23:30 МСК — доход декабря, а не января, хотя в UTC он уже следующего года.
  const msk = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return msk.getUTCMonth();
}

/**
 * Доход строки, который можно класть в отчёт. Возврат и нерешённая строка
 * дохода не дают: в первом случае деньги вернулись, во втором сумма неизвестна,
 * и подставлять ноль вместо «неизвестно» — это молча занизить базу.
 */
function reportableIncome(entry: IncomeBookEntry): number {
  if (entry.refunded || entry.ownIncomeKopecks === null) return 0;
  return entry.ownIncomeKopecks;
}

export function buildAnnualPackage(entries: readonly IncomeBookEntry[], year: number): AnnualPackage {
  const months: AnnualMonthRow[] = MONTHS.map((month) => ({
    month,
    turnoverKopecks: 0,
    ownIncomeKopecks: 0,
    refundedOwnIncomeKopecks: 0,
    payments: 0,
    withReceipt: 0,
  }));

  const subjectMap = new Map<string, AnnualSubjectRow>();
  const receipts: IncomeBookEntry[] = [];
  const missingReceipts: IncomeBookEntry[] = [];
  const refunds: IncomeBookEntry[] = [];

  for (const entry of entries) {
    const index = monthIndexMsk(entry.recognizedAt);
    const row = months[index];
    row.payments += 1;
    row.turnoverKopecks += entry.turnoverKopecks;
    row.ownIncomeKopecks += reportableIncome(entry);
    if (entry.receiptReference) {
      row.withReceipt += 1;
      receipts.push(entry);
    } else {
      missingReceipts.push(entry);
    }

    if (entry.refunded) {
      refunds.push(entry);
      // Возврат уменьшает базу ДАТОЙ ВОЗВРАТА, а не датой платежа: иначе
      // декабрьский возврат январского платежа исказил бы оба месяца.
      const refundIndex = monthIndexMsk(entry.refundedAt ?? entry.recognizedAt);
      months[refundIndex].refundedOwnIncomeKopecks += entry.ownIncomeKopecks ?? 0;
    }

    const subjectLabel = entry.subject ? SUBJECT_LABEL[entry.subject] : "вид не определён";
    const subject = subjectMap.get(subjectLabel) ?? {
      subject: subjectLabel,
      turnoverKopecks: 0,
      ownIncomeKopecks: 0,
      payments: 0,
    };
    subject.payments += 1;
    subject.turnoverKopecks += entry.turnoverKopecks;
    subject.ownIncomeKopecks += reportableIncome(entry);
    subjectMap.set(subjectLabel, subject);
  }

  const totals = months.reduce(
    (acc, row) => ({
      turnoverKopecks: acc.turnoverKopecks + row.turnoverKopecks,
      ownIncomeKopecks: acc.ownIncomeKopecks + row.ownIncomeKopecks,
      refundedOwnIncomeKopecks: acc.refundedOwnIncomeKopecks + row.refundedOwnIncomeKopecks,
      payments: acc.payments + row.payments,
      withReceipt: acc.withReceipt + row.withReceipt,
    }),
    { turnoverKopecks: 0, ownIncomeKopecks: 0, refundedOwnIncomeKopecks: 0, payments: 0, withReceipt: 0 },
  );

  return {
    year,
    months,
    subjects: [...subjectMap.values()].sort((a, b) => b.turnoverKopecks - a.turnoverKopecks),
    receipts,
    missingReceipts,
    refunds,
    totals: {
      ...totals,
      ownIncomeSharePercent: totals.turnoverKopecks === 0
        ? 0
        : Math.round((totals.ownIncomeKopecks / totals.turnoverKopecks) * 1000) / 10,
    },
  };
}

export { RECOGNITION_LABEL, SUBJECT_LABEL };
