/**
 * B591 — ручные приходы и расходы вне платёжного рельса.
 *
 * GET    /api/admin/finance/ledger?year=2026 — строки за год
 * POST   /api/admin/finance/ledger            — добавить строку
 * DELETE /api/admin/finance/ledger?id=…       — удалить строку
 *
 * Только суперадмин: это цифры, из которых считается налог. Каждое изменение
 * пишется в аудит — строку, попавшую в декларацию, надо уметь объяснить.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  LEDGER_ERROR_MESSAGE,
  summarizeManualLedger,
  validateLedgerInput,
  type ManualLedgerEntry,
} from "@/lib/ip-manual-ledger";

export const dynamic = "force-dynamic";

function yearRange(raw: string | null, now: Date) {
  const parsed = Number(raw);
  const year = Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : now.getUTCFullYear();
  return { year, from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
}

async function loadEntries(from: Date, to: Date): Promise<ManualLedgerEntry[]> {
  const rows = await db.ipLedgerEntry.findMany({
    where: { occurredAt: { gte: from, lt: to } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt,
    direction: row.direction === "expense" ? "expense" : "income",
    categoryKey: row.categoryKey,
    amountKopecks: row.amountKopecks,
    taxable: row.taxable,
    counterparty: row.counterparty,
    documentRef: row.documentRef,
    note: row.note,
  }));
}

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { year, from, to } = yearRange(new URL(request.url).searchParams.get("year"), new Date());
  const entries = await loadEntries(from, to);
  return NextResponse.json({ year, entries, totals: summarizeManualLedger(entries) });
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Пустой запрос" }, { status: 400 });

  const parsed = validateLedgerInput(body as Parameters<typeof validateLedgerInput>[0]);
  if (!parsed.ok) return NextResponse.json({ error: LEDGER_ERROR_MESSAGE[parsed.error], code: parsed.error }, { status: 400 });

  const created = await db.ipLedgerEntry.create({
    data: {
      occurredAt: parsed.value.occurredAt,
      direction: parsed.value.direction,
      categoryKey: parsed.value.categoryKey,
      amountKopecks: parsed.value.amountKopecks,
      taxable: parsed.value.taxable,
      counterparty: parsed.value.counterparty,
      documentRef: parsed.value.documentRef,
      note: parsed.value.note,
      createdById: session.user.id ?? null,
    },
  });

  await logAudit(
    session.user.id!,
    "PROFILE_UPDATE",
    undefined,
    JSON.stringify({
      action: "ip_ledger_add",
      id: created.id,
      direction: created.direction,
      category: created.categoryKey,
      amountKopecks: created.amountKopecks,
      taxable: created.taxable,
    }),
  );

  return NextResponse.json({ ok: true, id: created.id });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указана строка" }, { status: 400 });

  const existing = await db.ipLedgerEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });

  await db.ipLedgerEntry.delete({ where: { id } });
  await logAudit(
    session.user.id!,
    "PROFILE_UPDATE",
    undefined,
    JSON.stringify({
      action: "ip_ledger_delete",
      id,
      direction: existing.direction,
      category: existing.categoryKey,
      amountKopecks: existing.amountKopecks,
    }),
  );

  return NextResponse.json({ ok: true });
}
