import * as XLSX from "xlsx";
import { BookingStatus } from "@prisma/client";
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

function htmlEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlTable(title: string, rows: Record<string, unknown>[]) {
  const headers = rows[0] ? Object.keys(rows[0]) : ["Нет данных"];
  return `
    <section>
      <h2>${htmlEscape(title)}</h2>
      <table>
        <thead><tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.length
            ? rows.map((row) => `<tr>${headers.map((header) => `<td>${htmlEscape(row[header])}</td>`).join("")}</tr>`).join("")
            : `<tr><td colspan="${headers.length}">Нет данных за выбранный период</td></tr>`}
        </tbody>
      </table>
    </section>
  `;
}

function htmlReport(periodLabel: string, reportRows: Record<string, unknown>[], sessionRows: Record<string, unknown>[]) {
  return `<!doctype html>
  <html lang="ru">
    <head>
      <meta charset="utf-8" />
      <title>Электронный отчет услуг практика</title>
      <style>
        body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Arial, sans-serif; }
        main { max-width: 1180px; margin: 0 auto; padding: 32px 20px; }
        h1 { margin: 0 0 8px; font-size: 24px; }
        h2 { margin: 28px 0 10px; font-size: 16px; }
        p { margin: 0 0 14px; color: #475569; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d6dee9; font-size: 12px; }
        th, td { border: 1px solid #d6dee9; padding: 7px 8px; text-align: left; vertical-align: top; }
        th { background: #eef2f7; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
        td { white-space: normal; word-break: break-word; }
      </style>
    </head>
    <body>
      <main>
        <h1>Электронный отчет услуг практика</h1>
        <p>Период отчета: ${htmlEscape(periodLabel)}.</p>
        ${htmlTable("Сводка отчета", reportRows)}
        ${htmlTable("Оказанные услуги за период", sessionRows)}
      </main>
    </body>
  </html>`;
}

type AgentReportExportRow = {
  report_id: string;
  practitioner_name: string;
  practitioner_email: string;
  tariff: string | null;
  commission_percent: number;
  period_start: string;
  period_end: string;
  sessions: number;
  gross_rub: number;
  commission_rub: number;
  payout_due_rub: number;
  payout_status: string;
  status: string;
};

function agentReportExportRows(reportRows: AgentReportExportRow[], sessionRows: Record<string, unknown>[]) {
  if (sessionRows.length === 0) return reportRows;
  return sessionRows.map((sessionRow) => {
    const practitionerEmail = String(sessionRow.practitioner_email ?? "");
    const report = reportRows.find((row) => row.practitioner_email === practitionerEmail);
    return {
      report_id: report?.report_id ?? "",
      practitioner_name: sessionRow.practitioner_name ?? report?.practitioner_name ?? "",
      practitioner_email: practitionerEmail || report?.practitioner_email || "",
      tariff: report?.tariff ?? "",
      commission_percent: sessionRow.commission_percent ?? report?.commission_percent ?? "",
      period_start: report?.period_start ?? "",
      period_end: report?.period_end ?? "",
      report_sessions: report?.sessions ?? "",
      report_gross_rub: report?.gross_rub ?? "",
      report_commission_rub: report?.commission_rub ?? "",
      report_payout_due_rub: report?.payout_due_rub ?? "",
      payout_status: report?.payout_status ?? "",
      report_status: report?.status ?? "",
      service_booking_id: sessionRow.booking_id ?? "",
      service_timestamp: sessionRow.timestamp ?? "",
      client_name: sessionRow.client_name ?? "",
      client_email: sessionRow.client_email ?? "",
      duration_minutes: sessionRow.duration_minutes ?? "",
      service_gross_rub: sessionRow.gross_rub ?? "",
      service_commission_rub: sessionRow.commission_rub ?? "",
      service_payout_due_rub: sessionRow.payout_due_rub ?? "",
    };
  });
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
  const rawFormat = url.searchParams.get("format");
  const format = rawFormat === "csv" || rawFormat === "html" ? rawFormat : "xlsx";
  const scope = url.searchParams.get("scope");
  const practitionerId = url.searchParams.get("practitionerId") ?? undefined;
  const reportId = url.searchParams.get("reportId") ?? undefined;
  const concreteReportId = reportId && !reportId.startsWith("calculated-") ? reportId : undefined;

  const [transactions, reports, completedBookings] = await Promise.all([
    db.transaction.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.agentReport.findMany({
      where: {
        periodStart: { gte: period.start },
        periodEnd: { lte: period.end },
        ...(practitionerId ? { practitionerId } : {}),
        ...(concreteReportId ? { id: concreteReportId } : {}),
      },
      include: { practitioner: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { periodEnd: "asc" },
    }),
    scope === "agent-reports"
      ? db.booking.findMany({
        where: {
          status: BookingStatus.COMPLETED,
          ...(practitionerId ? { practitionerId } : {}),
          OR: [
            { endedAt: { gte: period.start, lte: period.end } },
            { endedAt: null, updatedAt: { gte: period.start, lte: period.end } },
          ],
        },
        include: {
          client: { select: { name: true, email: true } },
          practitioner: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: { updatedAt: "asc" },
        take: 2000,
      })
      : Promise.resolve([]),
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

  const reportRowsFromDb: AgentReportExportRow[] = reports.map((report) => ({
    report_id: report.id,
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
  const calculatedRows = Array.from(completedBookings.reduce<Map<string, AgentReportExportRow>>((map, booking) => {
    if (reports.some((report) => report.practitionerId === booking.practitionerId)) return map;
    const current = map.get(booking.practitionerId) ?? {
      report_id: `calculated-${booking.practitionerId}`,
      practitioner_name: booking.practitioner.user.name,
      practitioner_email: booking.practitioner.user.email,
      tariff: booking.practitioner.commissionSource,
      commission_percent: booking.practitioner.commissionPercent,
      period_start: formatDateTime(period.start),
      period_end: formatDateTime(period.end),
      sessions: 0,
      gross_rub: 0,
      commission_rub: 0,
      payout_due_rub: 0,
      payout_status: "CALCULATED",
      status: "CALCULATED",
    };
    const commissionPercent = booking.commissionPercentApplied ?? booking.practitioner.commissionPercent ?? 35;
    current.sessions += 1;
    current.gross_rub += booking.priceRub;
    current.commission_rub += Math.round(booking.priceRub * commissionPercent) / 100;
    current.payout_due_rub += Math.max(0, booking.priceRub - Math.round(booking.priceRub * commissionPercent) / 100);
    map.set(booking.practitionerId, current);
    return map;
  }, new Map<string, AgentReportExportRow>()).values());
  const reportRows = [...reportRowsFromDb, ...calculatedRows];
  const sessionRows = completedBookings.map((booking) => {
    const commissionPercent = booking.commissionPercentApplied ?? booking.practitioner.commissionPercent ?? 35;
    const commissionRub = Math.round(booking.priceRub * commissionPercent) / 100;
    return {
      booking_id: booking.id,
      timestamp: formatDateTime(booking.endedAt ?? booking.updatedAt),
      practitioner_name: booking.practitioner.user.name,
      practitioner_email: booking.practitioner.user.email,
      client_name: booking.client.name,
      client_email: booking.client.email,
      duration_minutes: Math.max(1, Math.round(((booking.endedAt ?? booking.updatedAt).getTime() - (booking.startedAt ?? booking.updatedAt).getTime()) / 60_000)),
      gross_rub: booking.priceRub,
      commission_percent: commissionPercent,
      commission_rub: commissionRub,
      payout_due_rub: Math.max(0, booking.priceRub - commissionRub),
    };
  });

  if (format === "html") {
    return new Response(htmlReport(`${period.startInput} — ${period.endInput}`, reportRows, sessionRows), {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  const agentExportRows = agentReportExportRows(reportRows, sessionRows);
  const exportRows = scope === "agent-reports" ? agentExportRows : (transactionRows.length ? transactionRows : reportRows);

  if (format === "csv") {
    return new Response(csv(exportRows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="eterapy-${scope === "agent-reports" ? "agent-reports" : "finance"}-${period.startInput}-${period.endInput}.csv"`,
      },
    });
  }

  const workbook = XLSX.utils.book_new();
  if (scope === "agent-reports") {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(agentExportRows), "Электронный отчет");
  } else {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactionRows), "Поступления");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportRows), "Отчеты практиков");
  }
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="eterapy-${scope === "agent-reports" ? "agent-reports" : "finance"}-${period.startInput}-${period.endInput}.xlsx"`,
    },
  });
}
