import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { computePractitionerBalance } from "@/lib/practitioner-balance";
import { assertPractitionerPayoutAllowed } from "@/lib/practitioner-antifraud";
import {
  PAYOUT_HOLD_DAYS_BY_PLAN,
  payoutAvailableAt,
  payoutReserveKopecks,
  resolvePractitionerPayoutPlanKey,
} from "@/lib/payout-runs";
import { resolvePayoutProvider } from "@/lib/payments/payout-provider";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminId = session.user!.id!;
  const perms = await getUserPermissions(adminId, role);
  if (!perms.includes("practitioners.payout")) {
    return NextResponse.json({ error: "Нет полномочия practitioners.payout" }, { status: 403 });
  }

  const { id } = await params;
  const practitioner = await db.practitioner.findUnique({
    where: { id },
    select: { id: true, userId: true, commissionPercent: true },
  });
  if (!practitioner) return NextResponse.json({ error: "Практик не найден" }, { status: 404 });

  const balance = await computePractitionerBalance(id);
  if (!balance) return NextResponse.json({ error: "Не удалось посчитать баланс" }, { status: 500 });

  if (balance.currentBalance <= 0) {
    return NextResponse.json({ error: "Нет средств к выплате" }, { status: 400 });
  }

  const payoutGate = await assertPractitionerPayoutAllowed(id);
  if (!payoutGate.allowed) {
    return NextResponse.json(
      { error: "Выплата удержана до проверки риска", reasons: payoutGate.reasons },
      { status: 409 },
    );
  }

  // B352/Баг 12: «Выплатить» теперь делает реальную выплату в ЮKassa по
  // реквизитам практика. Без реквизитов / для неподдержанного типа — ошибка
  // (деньги не двигаются, запись Payout не создаётся).
  const details = await db.payoutDetails.findUnique({
    where: { practitionerId: id },
    select: { type: true, accountNumber: true, inn: true },
  });
  if (!details) {
    return NextResponse.json({ error: "У практика не указаны платёжные реквизиты" }, { status: 400 });
  }
  // B562: провайдера выбираем, а не импортируем. Проверка идёт ДО создания
  // записи Payout: иначе на неподдерживаемых реквизитах в базе оставалась бы
  // висеть выплата, которую никто не отправлял.
  const payoutProvider = await resolvePayoutProvider();
  if (!payoutProvider.supportsAutoPayout(details)) {
    return NextResponse.json(
      {
        error: payoutProvider.name === "robokassa"
          ? "Выплаты через Robokassa ещё не подключены — проведите выплату вручную."
          : "Авто-выплата поддерживает только банковскую карту. СБП/юр-лицо — вручную.",
      },
      { status: 400 },
    );
  }

  const amountKopecks = balance.currentBalance * 100;
  const now = new Date();
  const planKeyAtPayout = await resolvePractitionerPayoutPlanKey(practitioner.userId, db, now);
  const holdDays = PAYOUT_HOLD_DAYS_BY_PLAN[planKeyAtPayout];
  const reserveKopecks = payoutReserveKopecks(planKeyAtPayout, amountKopecks);

  const payout = await db.payout.create({
    data: {
      practitionerId: id,
      amountKopecks,
      status: "PENDING",
      initiatedBy: adminId,
      availableAt: payoutAvailableAt(planKeyAtPayout, now),
      holdReason: "payout_delay",
      holdDays,
      planKeyAtPayout,
      reserveKopecks,
    },
    select: { id: true, amountKopecks: true, status: true, createdAt: true },
  });

  // Отправляем выплату активным провайдером. Никогда не бросает — при ошибке
  // помечает payout FAILED (баланс практика восстанавливается).
  const sent = await payoutProvider.send({
    payoutId: payout.id,
    details,
    amountKopecks,
    description: `Выплата практику ${balance.currentBalance.toLocaleString("ru")} ₽`,
  });

  await logAudit(
    adminId,
    "PRACTITIONER_PAYOUT",
    practitioner.userId,
    `Выплата ${balance.currentBalance.toLocaleString("ru")} ₽ (комиссия ${balance.commissionPercent}%) → ${sent.status}${sent.externalId ? ` [${sent.externalId}]` : ""}`,
  );

  if (sent.status === "FAILED") {
    return NextResponse.json({ error: sent.error ?? "Выплата не прошла" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    payout: { ...payout, status: sent.status, externalId: sent.externalId },
    balanceBefore: balance,
  });
}
