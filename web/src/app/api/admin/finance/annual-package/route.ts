/**
 * B591 фаза 4 — годовой пакет одним файлом.
 *
 * Пять листов: помесячная динамика, разбивка по видам продаж, реестр чеков,
 * строки БЕЗ чека и реестр возвратов. Плюс лист сроков ИП — тот же календарь,
 * что на экране, чтобы бухгалтер видел, что и когда уже сдано.
 *
 * Лист «Без чека» существует отдельно намеренно: оплата без чека — нарушение
 * 54-ФЗ, и она не должна теряться среди строк, у которых всё в порядке.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createXlsxExport } from "@/lib/xlsx-export";
import { buildIncomeBook } from "@/lib/ip-income-book";
import { loadIncomeRecords } from "@/lib/ip-income-book-data";
import { buildAnnualPackage, RECOGNITION_LABEL, SUBJECT_LABEL } from "@/lib/ip-annual-package";
import { buildObligationSchedule } from "@/lib/ip-accounting";

export const dynamic = "force-dynamic";

const rub = (kopecks: number) => (kopecks / 100).toFixed(2);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const OBLIGATION_STATE_LABEL: Record<string, string> = {
  done: "сделано",
  overdue: "просрочено",
  soon: "скоро",
  upcoming: "впереди",
};

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const now = new Date();
  const requestedYear = Number(url.searchParams.get("year"));
  const year = Number.isInteger(requestedYear) && requestedYear >= 2020 && requestedYear <= 2100
    ? requestedYear
    : now.getUTCFullYear();

  const { records } = await loadIncomeRecords({
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year + 1, 0, 1)),
  });
  const { entries } = buildIncomeBook(records, now);
  const pkg = buildAnnualPackage(entries, year);

  const months = pkg.months.map((row) => ({
    "Месяц": row.month,
    "Поступлений": row.payments,
    "Оборот, ₽": rub(row.turnoverKopecks),
    "Ваш доход, ₽": rub(row.ownIncomeKopecks),
    "Снято возвратами, ₽": rub(row.refundedOwnIncomeKopecks),
    "С чеком": row.withReceipt,
  }));

  const subjects = pkg.subjects.map((row) => ({
    "Что продано": row.subject,
    "Поступлений": row.payments,
    "Оборот, ₽": rub(row.turnoverKopecks),
    "Ваш доход, ₽": rub(row.ownIncomeKopecks),
  }));

  const entryRow = (entry: (typeof pkg.receipts)[number]) => ({
    "Дата признания": isoDate(entry.recognizedAt),
    "Источник": entry.provider,
    "Номер платежа": entry.reference,
    "Что продано": entry.subject ? SUBJECT_LABEL[entry.subject] : "вид не определён",
    "Оборот, ₽": rub(entry.turnoverKopecks),
    "Ваш доход, ₽": entry.ownIncomeKopecks === null ? "" : rub(entry.ownIncomeKopecks),
    "Признание": entry.recognition ? RECOGNITION_LABEL[entry.recognition] : "",
    "Фискальный чек": entry.receiptReference ?? "",
    "Дата возврата": entry.refundedAt ? isoDate(entry.refundedAt) : "",
    "Требует решения": entry.issue ?? "",
  });

  const obligations = buildObligationSchedule(year, now).map((obligation) => ({
    "Срок": isoDate(obligation.dueAt),
    "Что": obligation.title,
    "Куда": obligation.recipient,
    "Кто делает": obligation.responsible,
    "Состояние": OBLIGATION_STATE_LABEL[obligation.state] ?? obligation.state,
    "Пояснение": obligation.doneNote ?? obligation.note,
  }));

  const summary = [
    { "Показатель": "Год", "Значение": String(year) },
    { "Показатель": "Поступлений", "Значение": String(pkg.totals.payments) },
    { "Показатель": "Оборот, ₽", "Значение": rub(pkg.totals.turnoverKopecks) },
    { "Показатель": "Ваш доход, ₽", "Значение": rub(pkg.totals.ownIncomeKopecks) },
    { "Показатель": "Доля дохода в обороте, %", "Значение": String(pkg.totals.ownIncomeSharePercent) },
    { "Показатель": "Снято возвратами, ₽", "Значение": rub(pkg.totals.refundedOwnIncomeKopecks) },
    { "Показатель": "Поступлений с чеком", "Значение": `${pkg.totals.withReceipt} из ${pkg.totals.payments}` },
    { "Показатель": "Поступлений без чека", "Значение": String(pkg.missingReceipts.length) },
    {
      "Показатель": "Оговорка",
      "Значение": "Данные для бухгалтера, не декларация и не КУДиР. По агентским услугам "
        + "доходом признаётся только комиссия платформы. Суммы налога — оценка, а не расчёт.",
    },
  ];

  const buffer = await createXlsxExport([
    { name: "Итоги года", rows: summary },
    { name: "По месяцам", rows: months },
    { name: "По видам продаж", rows: subjects.length ? subjects : [{ "Что продано": "нет поступлений" }] },
    { name: "Чеки", rows: pkg.receipts.length ? pkg.receipts.map(entryRow) : [{ "Номер платежа": "нет строк с чеком" }] },
    { name: "Без чека", rows: pkg.missingReceipts.length ? pkg.missingReceipts.map(entryRow) : [{ "Номер платежа": "нет" }] },
    { name: "Возвраты", rows: pkg.refunds.length ? pkg.refunds.map(entryRow) : [{ "Номер платежа": "возвратов не было" }] },
    { name: "Сроки ИП", rows: obligations },
  ]);

  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="eterapy-annual-package-${year}.xlsx"`,
    },
  });
}
