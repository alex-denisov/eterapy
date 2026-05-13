import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { computePractitionerBalance } from "@/lib/practitioner-balance";
import { assertPractitionerPayoutAllowed, payoutAvailableAt } from "@/lib/practitioner-antifraud";

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

  const amountKopecks = balance.currentBalance * 100;

  const payout = await db.payout.create({
    data: {
      practitionerId: id,
      amountKopecks,
      status: "PENDING",
      initiatedBy: adminId,
      availableAt: payoutAvailableAt(),
      holdReason: "payout_delay",
    },
    select: { id: true, amountKopecks: true, status: true, createdAt: true },
  });

  await logAudit(
    adminId,
    "PRACTITIONER_PAYOUT",
    practitioner.userId,
    `Ручная выплата ${balance.currentBalance.toLocaleString("ru")} ₽ (комиссия ${balance.commissionPercent}%)`,
  );

  return NextResponse.json({ ok: true, payout, balanceBefore: balance });
}
