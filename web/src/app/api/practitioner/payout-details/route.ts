/**
 * X13: practitioner payout requisites (реквизиты для выплат).
 * GET  — current PayoutDetails for the signed-in practitioner.
 * PATCH — upsert {type: CARD|SBP, accountNumber, bankName?}.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";

const ALLOWED_TYPES = new Set(["CARD", "SBP"]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true, payoutDetails: { select: { type: true, accountNumber: true, bankName: true, updatedAt: true } } },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  return NextResponse.json({ ok: true, payoutDetails: practitioner.payoutDetails });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const type = typeof body.type === "string" ? body.type.toUpperCase() : "";
  const accountNumberRaw = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  const bankName = typeof body.bankName === "string" ? body.bankName.trim().slice(0, 120) : "";

  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Выберите способ выплаты: карта или СБП" }, { status: 400 });
  }
  // strip spaces from card/phone; keep a leading + for phone numbers
  const accountNumber = accountNumberRaw.replace(/(?!^\+)[^\d]/g, "");
  if (type === "CARD" && !/^\d{16,19}$/.test(accountNumber)) {
    return NextResponse.json({ error: "Введите номер карты (16–19 цифр)" }, { status: 400 });
  }
  if (type === "SBP" && !/^\+?\d{10,15}$/.test(accountNumber)) {
    return NextResponse.json({ error: "Введите номер телефона для СБП" }, { status: 400 });
  }

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  await db.payoutDetails.upsert({
    where: { practitionerId: practitioner.id },
    create: { practitionerId: practitioner.id, type, accountNumber, bankName: bankName || null },
    update: { type, accountNumber, bankName: bankName || null },
  });

  await logAudit(session.user.id, "PAYOUT_DETAILS_UPDATE", undefined, `Реквизиты выплат обновлены (${type})`);

  return NextResponse.json({ ok: true });
}
