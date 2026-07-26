/**
 * X13/Y3: practitioner payout requisites (реквизиты для выплат).
 * GET   — current PayoutDetails for the signed-in practitioner.
 * PATCH — upsert one of three payout methods:
 *   • CARD   — банковская карта (самозанятые): accountNumber = номер карты.
 *   • SBP    — СБП по телефону: accountNumber = номер телефона.
 *   • ENTITY — реквизиты юр. лица (ИП/ООО): расчётный счёт + БИК/КПП/банк.
 * B466/B483: ИНН клиентом НЕ передаётся — берётся из подтверждённого
 * налогового статуса (Practitioner.inn); без подтверждения PATCH запрещён.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { normalizeRobokassaAccount } from "@/lib/payments/robokassa-split";

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
  // B583: адресат сплита Robokassa — отдельно от банковских реквизитов.
  robokassaAccount: true,
  robokassaVerifiedAt: true,
  kycStatus: true,
  kycVerifiedAt: true,
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

  // B583: аккаунт Robokassa правится отдельным действием. Он не «ещё один
  // способ выплаты» в ряду CARD/SBP/ENTITY, а адресат сплита: Robokassa
  // сплитует только на аккаунт Robokassa, альтернативы нет. Отдельное действие
  // нужно и затем, чтобы указать аккаунт можно было, не переоформляя банковские
  // реквизиты заново.
  if (str(body.action) === "robokassa_account") {
    return patchRobokassaAccount(session.user.id, body.robokassaAccount);
  }

  const type = str(body.type).toUpperCase();
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Выберите способ выплаты: карта, СБП или реквизиты юр. лица" }, { status: 400 });
  }

  // B466/B483: ИНН вводится и проверяется ТОЛЬКО на «Налоговый статус» —
  // реквизиты можно добавить лишь после подтверждения; ИНН берём из профиля.
  const gate = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { inn: true, taxStatus: true, taxReviewStatus: true },
  });
  if (!gate) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  if (!gate.inn || gate.taxReviewStatus !== "VERIFIED") {
    return NextResponse.json(
      { error: "Добавление платёжного средства недоступно. Сначала заполните ИНН и подтвердите налоговый статус." },
      { status: 409 },
    );
  }
  // Способ выплаты соответствует статусу: самозанятый — карта/СБП,
  // ИП/юр. лицо — расчётный счёт.
  if (gate.taxStatus === "SELF_EMPLOYED" && type === "ENTITY") {
    return NextResponse.json({ error: "Для самозанятых доступны карта или СБП" }, { status: 400 });
  }
  if ((gate.taxStatus === "INDIVIDUAL_ENTREPRENEUR" || gate.taxStatus === "LEGAL_ENTITY") && type !== "ENTITY") {
    return NextResponse.json({ error: "Для ИП и юр. лиц выплаты идут на расчётный счёт" }, { status: 400 });
  }

  const bankName = str(body.bankName, 120);
  const accountNumberRaw = str(body.accountNumber, 64);
  const inn = gate.inn;

  // CARD / SBP — самозанятые: способ выплаты (ИНН уже подтверждён).
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
      inn,
      kpp: null,
      bik: null,
      corrAccount: null,
      kycStatus: "NOT_REQUIRED",
      kycVerifiedAt: null,
    });
  }

  // ENTITY — реквизиты ИП / ООО.
  const legalName = str(body.legalName, 200);
  const kpp = str(body.kpp, 9).replace(/\D/g, "");
  const bik = str(body.bik, 9).replace(/\D/g, "");
  const account = accountNumberRaw.replace(/\D/g, ""); // расчётный счёт
  const corrAccount = str(body.corrAccount, 20).replace(/\D/g, "");

  if (legalName.length < 3) {
    return NextResponse.json({ error: "Укажите наименование организации или ИП" }, { status: 400 });
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
    kycStatus: "PENDING",
    kycVerifiedAt: null,
  });
}

async function patchRobokassaAccount(userId: string, raw: unknown) {
  const practitioner = await db.practitioner.findUnique({
    where: { userId },
    select: { id: true, payoutDetails: { select: { id: true } } },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const input = str(raw, 64);
  // Пустое значение = отвязать аккаунт. Это законное действие: специалист мог
  // ошибиться или сменить аккаунт, и запирать его в первом введённом нельзя.
  const account = input ? normalizeRobokassaAccount(input) : null;
  if (input && !account) {
    return NextResponse.json(
      { error: "Идентификатор аккаунта Robokassa: 3–64 символа, латиница, цифры, точка, дефис или подчёркивание" },
      { status: 400 },
    );
  }

  if (!practitioner.payoutDetails) {
    // Записи реквизитов ещё нет: аккаунт Robokassa не заменяет банковские
    // реквизиты — они нужны фискальной части и ручной выплате, — поэтому
    // порядок остаётся прежним, сначала способ выплаты.
    return NextResponse.json(
      { error: "Сначала заполните способ выплаты, затем укажите аккаунт Robokassa" },
      { status: 409 },
    );
  }

  await db.payoutDetails.update({
    where: { practitionerId: practitioner.id },
    // Подтверждение аккаунта — не наше действие: его сверяет Robokassa при
    // первом сплите. Сбрасываем отметку при каждой смене, чтобы «подтверждён»
    // никогда не относился к другому аккаунту.
    data: { robokassaAccount: account, robokassaVerifiedAt: null },
  });

  await logAudit(
    userId,
    "PAYOUT_DETAILS_UPDATE",
    undefined,
    account ? `Аккаунт Robokassa указан (${account})` : "Аккаунт Robokassa отвязан",
  );
  return NextResponse.json({ ok: true, robokassaAccount: account });
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
    kycStatus: string;
    kycVerifiedAt: Date | null;
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
