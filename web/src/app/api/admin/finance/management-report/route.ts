import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { cardMask, formatDateTime } from "@/app/admin/admin-analytics-ui";
import {
  cardPartsFromMetadata,
  paymentMethodFromMetadata,
  resolveAdminPeriod,
} from "@/app/admin/admin-analytics-data";

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

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const period = resolveAdminPeriod({
    start: url.searchParams.get("start") ?? undefined,
    end: url.searchParams.get("end") ?? undefined,
  });
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const [transactions, reports] = await Promise.all([
    db.transaction.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.agentReport.findMany({
      where: { periodStart: { gte: period.start }, periodEnd: { lte: period.end } },
      include: { practitioner: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { periodEnd: "asc" },
    }),
  ]);

  const transactionRows = transactions.map((tx) => {
    const card = cardPartsFromMetadata(tx.metadata);
    const method = paymentMethodFromMetadata(tx.provider, tx.metadata);
    return {
      timestamp: formatDateTime(tx.createdAt),
      client_name: tx.user.name,
      client_email: tx.user.email,
      amount_rub: tx.amount / 100,
      currency: tx.currency,
      status: tx.status,
      provider: tx.provider,
      provider_payment_id: tx.providerPaymentId ?? "",
      payment_method: method,
      payment_source: method === "Банковская карта" ? cardMask(card.first6, card.last4) : "",
      description: tx.description ?? "",
    };
  });

  const reportRows = reports.map((report) => ({
    practitioner_name: report.practitioner.user.name,
    practitioner_email: report.practitioner.user.email,
    tariff: report.practitioner.commissionSource,
    commission_percent: report.practitioner.commissionPercent,
    period_start: formatDateTime(report.periodStart),
    period_end: formatDateTime(report.periodEnd),
    sessions: report.sessionCount,
    gross_rub: report.grossKopecks / 100,
    commission_rub: report.commissionKopecks / 100,
    payout_due_rub: report.payoutDueKopecks / 100,
    payout_status: report.payoutStatus,
    status: report.status,
  }));

  if (format === "csv") {
    return new Response(csv(transactionRows.length ? transactionRows : reportRows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="eterapy-finance-${period.startInput}-${period.endInput}.csv"`,
      },
    });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactionRows), "Поступления");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportRows), "Отчеты практиков");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="eterapy-finance-${period.startInput}-${period.endInput}.xlsx"`,
    },
  });
}
