import * as XLSX from "xlsx";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

// B466 R9-5 — «Финансы → Отчёты» скачивание XLSX / CSV по периоду (owner ROUND 4 #3а).
// Реальная выгрузка завершённых сессий практика за MSK-месяц (?period=YYYY-MM) или
// за всё время. Комиссия — по фактически применённой ставке брони.

const ISO_MONTH = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Europe/Moscow" });
const DAY_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" });

function isoMonth(date: Date): string {
  const parts = ISO_MONTH.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(rows: Record<string, unknown>[]): string {
  const headers = rows[0] ? Object.keys(rows[0]) : ["Нет данных"];
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\r\n");
}

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "PRACTITIONER") {
    return new Response("Forbidden", { status: 403 });
  }
  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id! },
    select: { id: true, commissionPercent: true },
  });
  if (!practitioner) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get("period");
  const period = rawPeriod && /^\d{4}-\d{2}$/.test(rawPeriod) ? rawPeriod : null;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const bookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      priceRub: true,
      commissionPercentApplied: true,
      source: true,
      createdAt: true,
      client: { select: { name: true } },
    },
  });

  const rows = bookings
    .filter((b) => !period || isoMonth(b.createdAt) === period)
    .map((b) => {
      const pct = b.commissionPercentApplied ?? practitioner.commissionPercent ?? 35;
      const fee = Math.round((b.priceRub * pct) / 100);
      return {
        Дата: DAY_FMT.format(b.createdAt),
        Клиент: b.client.name ?? "Клиент",
        "Сумма, ₽": b.priceRub,
        "Комиссия, %": pct,
        "Комиссия, ₽": fee,
        "К зачислению, ₽": b.priceRub - fee,
        Источник: b.source === "BYOC" ? "Своя ссылка" : "Платформа",
      };
    });

  const filenameBase = `eterapy-otchet-${period ?? "all"}`;

  if (format === "csv") {
    // BOM (﻿) — чтобы Excel корректно открыл кириллицу в UTF-8.
    return new Response(`﻿${csv(rows)}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filenameBase}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Дата: "—", Клиент: "нет данных за период" }]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Отчёт");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filenameBase}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
