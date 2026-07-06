/**
 * B466/B483 — «Налоговый статус»: авто-проверка ИНН + явное подтверждение.
 *
 * POST { step: "lookup",  status, inn } → валидация + данные проверки
 *   (ФИО/наименование, активность) БЕЗ сохранения — для окна
 *   «Это действительно Вы?».
 * POST { step: "confirm", status, inn } → повторная серверная проверка →
 *   сохранение Practitioner.{taxStatus, inn, taxReviewStatus: VERIFIED,
 *   taxStatusVerifiedAt} + синхронизация ИНН в PayoutDetails (гейт выплат).
 *
 * Owner-правила: ИНН вводится ТОЛЬКО здесь (не в реквизитах); статус
 * «подтверждён» — только после явного подтверждения пользователем.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  TAX_STATUS_LABELS,
  validateInn,
  type TaxStatusKey,
} from "@/lib/practitioner-tax-verification";
import { lookupTaxIdentity } from "@/lib/practitioner-tax-verification-provider";

const STATUSES = new Set<TaxStatusKey>(["SELF_EMPLOYED", "INDIVIDUAL_ENTREPRENEUR", "LEGAL_ENTITY"]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const step = body?.step === "confirm" ? "confirm" : "lookup";
  const status = typeof body?.status === "string" ? (body.status.toUpperCase() as TaxStatusKey) : null;
  if (!status || !STATUSES.has(status)) {
    return NextResponse.json({ error: "Выберите статус: самозанятый, ИП или юр. лицо" }, { status: 400 });
  }

  const validation = validateInn(typeof body?.inn === "string" ? body.inn : "", status);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      payoutDetails: { select: { practitionerId: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const identity = await lookupTaxIdentity({
    inn: validation.inn,
    status,
    fallbackDisplayName: practitioner.user.name ?? practitioner.user.email ?? "—",
  }).catch(() => null);
  if (!identity) {
    return NextResponse.json(
      { error: "Автоматическая проверка сейчас недоступна — попробуйте позже" },
      { status: 502 },
    );
  }
  if (!identity.active) {
    return NextResponse.json(
      { error: `Статус «${TAX_STATUS_LABELS[status]}» по этому ИНН не подтверждается — проверьте данные` },
      { status: 409 },
    );
  }

  if (step === "lookup") {
    return NextResponse.json({
      ok: true,
      identity: {
        displayName: identity.displayName,
        statusLabel: TAX_STATUS_LABELS[status],
        inn: validation.inn,
        source: identity.source,
      },
    });
  }

  // step === "confirm" — сохраняем ТОЛЬКО после явного подтверждения.
  const verifiedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.practitioner.update({
      where: { id: practitioner.id },
      data: {
        taxStatus: status,
        inn: validation.inn,
        taxReviewStatus: "VERIFIED",
        taxStatusVerifiedAt: verifiedAt,
        taxStatusRejectedReason: null,
      },
    });
    // Гейт выплат (payout-runs innMissing) читает PayoutDetails.inn — держим в
    // синхроне, если реквизиты уже существуют.
    if (practitioner.payoutDetails) {
      await tx.payoutDetails.update({
        where: { practitionerId: practitioner.id },
        data: { inn: validation.inn },
      });
    }
  });

  await logAudit(
    session.user.id,
    "TAX_STATUS_VERIFIED",
    undefined,
    `Налоговый статус подтверждён: ${TAX_STATUS_LABELS[status]} · ИНН ${validation.inn} · источник ${identity.source}`,
  );

  return NextResponse.json({ ok: true, verifiedAt: verifiedAt.toISOString() });
}
