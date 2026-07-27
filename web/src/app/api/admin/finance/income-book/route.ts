/**
 * B591 фаза 2 — выгрузка книги доходов для Альфа-бухгалтерии.
 *
 * Файл, который владелец пересылает бухгалтеру. Колонка «ваш доход» отделена от
 * оборота: по агентским услугам доходом признаётся только комиссия платформы
 * (ответ бухгалтера 2026-07-27). Строки с нерешённым вопросом выгружаются
 * ВМЕСТЕ со всеми, с текстом проблемы в отдельной колонке — молча выброшенная
 * строка расходится с выпиской по счёту, а это и есть то, чего мы избегаем.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createXlsxExport } from "@/lib/xlsx-export";
import {
  RECOGNITION_LABEL,
  SUBJECT_LABEL,
  buildIncomeBook,
} from "@/lib/ip-income-book";
import { loadIncomeRecords } from "@/lib/ip-income-book-data";

export const dynamic = "force-dynamic";

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(rows: Record<string, unknown>[]) {
  const headers = rows[0] ? Object.keys(rows[0]) : ["Нет данных"];
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

const rub = (kopecks: number) => (kopecks / 100).toFixed(2);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

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
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const { records } = await loadIncomeRecords({
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year + 1, 0, 1)),
  });
  const { entries, totals } = buildIncomeBook(records, now);

  const rows = entries.map((entry) => ({
    "Дата признания": isoDate(entry.recognizedAt),
    "Источник": entry.provider,
    "Номер платежа": entry.reference,
    "Что продано": entry.subject ? SUBJECT_LABEL[entry.subject] : "вид не определён",
    "Оборот, ₽": rub(entry.turnoverKopecks),
    "Ваш доход, ₽": entry.ownIncomeKopecks === null ? "" : rub(entry.ownIncomeKopecks),
    "Признание": entry.recognition ? RECOGNITION_LABEL[entry.recognition] : "",
    "Ставка комиссии, %": entry.commissionPercent ?? "",
    "Возврат": entry.refunded ? "да" : "",
    "Дата возврата": entry.refundedAt ? isoDate(entry.refundedAt) : "",
    "Фискальный чек": entry.receiptReference ?? "",
    "Требует решения": entry.issue ?? "",
    "Комментарий": entry.note ?? "",
  }));

  const summary = [
    { "Показатель": "Оборот за год, ₽", "Значение": rub(totals.turnoverKopecks) },
    { "Показатель": "Ваш доход за год, ₽", "Значение": rub(totals.ownIncomeKopecks) },
    { "Показатель": "Снято возвратами, ₽", "Значение": rub(totals.refundedOwnIncomeKopecks) },
    { "Показатель": "Строк требует решения", "Значение": String(totals.unresolvedCount) },
    { "Показатель": "Оборот по нерешённым строкам, ₽", "Значение": rub(totals.unresolvedTurnoverKopecks) },
    {
      "Показатель": "Оговорка",
      "Значение": "Данные для бухгалтера, не декларация и не КУДиР. По агентским услугам "
        + "доходом признаётся только комиссия платформы.",
    },
  ];

  const filename = `eterapy-income-book-${year}`;

  if (format === "csv") {
    return new Response(csv(rows.length ? rows : [{ "Дата признания": "нет поступлений" }]), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  const buffer = await createXlsxExport([
    { name: "Книга доходов", rows },
    { name: "Итоги", rows: summary },
  ]);
  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
