import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { parseBankStatement, parseRobokassaReceiptExport } from "@/lib/finance-import";

const MAX_FILE = 2 * 1024 * 1024;

function isTextUpload(value: FormDataEntryValue | null): value is File {
  return typeof value === "object"
    && value !== null
    && typeof (value as File).text === "function"
    && typeof (value as File).size === "number";
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const form = await request.formData();
  const file = form.get("file");
  const type = form.get("type");
  const confirmed = form.get("confirmed") === "true";
  if (!isTextUpload(file) || file.size <= 0 || file.size > MAX_FILE) {
    return NextResponse.json({ error: "Нужен CSV-файл до 2 МБ" }, { status: 400 });
  }
  if (type !== "bank" && type !== "robokassa") {
    return NextResponse.json({ error: "Неизвестный тип импорта" }, { status: 400 });
  }
  const text = await file.text();
  if (type === "bank") {
    const rows = parseBankStatement(text).slice(0, 5_000);
    if (!confirmed) return NextResponse.json({ ok: true, preview: true, rows: rows.slice(0, 50), total: rows.length });
    const result = await db.ipLedgerEntry.createMany({
      data: rows.map((row) => ({
        occurredAt: new Date(row.occurredAt),
        direction: row.direction,
        categoryKey: row.categoryKey,
        amountKopecks: row.amountKopecks,
        taxable: row.taxable,
        counterparty: row.counterparty,
        documentRef: row.documentRef,
        note: row.note,
        importKey: row.importKey,
        importSource: "BANK_CSV",
        createdById: session.user.id,
      })),
      skipDuplicates: true,
    });
    await logAudit(session.user.id, "PROFILE_UPDATE", undefined, JSON.stringify({
      action: "ip_ledger_bank_import",
      recognized: rows.length,
      inserted: result.count,
    }));
    return NextResponse.json({ ok: true, imported: result.count, duplicates: rows.length - result.count });
  }

  const rows = parseRobokassaReceiptExport(text).slice(0, 5_000);
  const invoiceIds = rows.map((row) => row.invoiceId);
  const matched = await db.transaction.findMany({
    where: { provider: "robokassa", invoiceId: { in: invoiceIds } },
    select: { id: true, invoiceId: true },
  });
  if (!confirmed) {
    const known = new Set(matched.map((row) => row.invoiceId));
    return NextResponse.json({
      ok: true,
      preview: true,
      rows: rows.slice(0, 50),
      total: rows.length,
      matched: known.size,
      unmatched: rows.filter((row) => !known.has(row.invoiceId)).length,
    });
  }
  const byInvoice = new Map(rows.map((row) => [row.invoiceId, row]));
  for (const transaction of matched) {
    const row = byInvoice.get(transaction.invoiceId);
    if (!row) continue;
    await db.transaction.update({
      where: { id: transaction.id },
      data: {
        fiscalReceiptStatus: row.status,
        fiscalReceiptRef: row.reference,
        fiscalReceiptError: row.error,
        fiscalReceiptCheckedAt: new Date(),
      },
    });
  }
  await logAudit(session.user.id, "FINANCE_PROVIDER_CHECK", undefined, JSON.stringify({
    action: "robokassa_receipt_import",
    rows: rows.length,
    matched: matched.length,
  }));
  return NextResponse.json({ ok: true, imported: matched.length, unmatched: rows.length - matched.length });
}
