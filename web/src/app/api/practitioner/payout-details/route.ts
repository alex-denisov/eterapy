/**
 * X13/Y3: practitioner payout requisites (реквизиты для выплат).
 * GET   — current PayoutDetails for the signed-in practitioner.
 * PATCH — upsert one of three payout methods:
 *   • CARD   — банковская карта (самозанятые): accountNumber = номер карты.
 *   • SBP    — СБП по телефону: accountNumber = номер телефона.
 *   • ENTITY — реквизиты юр. лица (ИП/ООО): расчётный счёт + ИНН/БИК/КПП/банк.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";

const ALLOWED_TYPES = new Set(["CARD", "SBP", "ENTITY"]);

const ENTITY_FIELDS = {
  type: true,
  accountNumber: true,
  bankName: true,
  legalName: true,
  inn: true,
  kpp: true,
  bik: true,
  corrAccount: true,
  updatedAt: true,
} as const;

function str(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true, payoutDetails: { select: ENTITY_FIELDS } },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  return NextResponse.json({ ok: true, payoutDetails: practitioner.payoutDetails });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const type = str(body.type).toUpperCase();
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Выберите способ выплаты: карта, СБП или реквизиты юр. лица" }, { status: 400 });
  }

  const bankName = str(body.bankName, 120);
  const accountNumberRaw = str(body.accountNumber, 64);

  // CARD / SBP — самозанятые: единственное поле плюс банк.
  if (type === "CARD" || type === "SBP") {
    const accountNumber = accountNumberRaw.replace(/(?!^\+)[^\d]/g, "");
    if (type === "CARD" && !/^\d{16,19}$/.test(accountNumber)) {
      return NextResponse.json({ error: "Введите номер карты (16–19 цифр)" }, { status: 400 });
    }
    if (type === "SBP" && !/^\+?\d{10,15}$/.test(accountNumber)) {
      return NextResponse.json({ error: "Введите номер телефона для СБП" }, { status: 400 });
    }
    return upsert(session.user.id, {
      type,
      accountNumber,
      bankName: bankName || null,
      legalName: null,
      inn: null,
      kpp: null,
      bik: null,
      corrAccount: null,
    });
  }

  // ENTITY — реквизиты ИП / ООО.
  const legalName = str(body.legalName, 200);
  const inn = str(body.inn, 12).replace(/\D/g, "");
  const kpp = str(body.kpp, 9).replace(/\D/g, "");
  const bik = str(body.bik, 9).replace(/\D/g, "");
  const account = accountNumberRaw.replace(/\D/g, ""); // расчётный счёт
  const corrAccount = str(body.corrAccount, 20).replace(/\D/g, "");

  if (legalName.length < 3) {
    return NextResponse.json({ error: "Укажите наименование организации или ИП" }, { status: 400 });
  }
  if (!/^(\d{10}|\d{12})$/.test(inn)) {
    return NextResponse.json({ error: "ИНН — 10 цифр (организация) или 12 (ИП)" }, { status: 400 });
  }
  if (!/^\d{20}$/.test(account)) {
    return NextResponse.json({ error: "Расчётный счёт — 20 цифр" }, { status: 400 });
  }
  if (!/^\d{9}$/.test(bik)) {
    return NextResponse.json({ error: "БИК банка — 9 цифр" }, { status: 400 });
  }
  if (kpp && !/^\d{9}$/.test(kpp)) {
    return NextResponse.json({ error: "КПП — 9 цифр (или оставьте пустым для ИП)" }, { status: 400 });
  }
  if (corrAccount && !/^\d{20}$/.test(corrAccount)) {
    return NextResponse.json({ error: "Корреспондентский счёт — 20 цифр" }, { status: 400 });
  }

  return upsert(session.user.id, {
    type,
    accountNumber: account,
    bankName: bankName || null,
    legalName,
    inn,
    kpp: kpp || null,
    bik,
    corrAccount: corrAccount || null,
  });
}

async function upsert(
  userId: string,
  data: {
    type: string;
    accountNumber: string;
    bankName: string | null;
    legalName: string | null;
    inn: string | null;
    kpp: string | null;
    bik: string | null;
    corrAccount: string | null;
  },
) {
  const practitioner = await db.practitioner.findUnique({ where: { userId }, select: { id: true } });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  await db.payoutDetails.upsert({
    where: { practitionerId: practitioner.id },
    create: { practitionerId: practitioner.id, ...data },
    update: data,
  });

  await logAudit(userId, "PAYOUT_DETAILS_UPDATE", undefined, `Реквизиты выплат обновлены (${data.type})`);
  return NextResponse.json({ ok: true });
}
