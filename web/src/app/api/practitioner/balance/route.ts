import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { computePractitionerBalance } from "@/lib/practitioner-balance";

/**
 * GET /api/practitioner/balance
 *
 * Returns the available practitioner earnings balance used by
 * /cabinet/practitioner/earnings, so the header and the balance page do not
 * drift into different money numbers.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user?.role !== "PRACTITIONER") {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!practitioner) {
    return NextResponse.json({ error: "Профиль практика не найден" }, { status: 404 });
  }

  const balance = await computePractitionerBalance(practitioner.id);
  const currentBalanceRub = Math.max(0, balance?.currentBalance ?? 0);
  const currentBalanceKopecks = currentBalanceRub * 100;

  return NextResponse.json({
    currentBalanceKopecks,
    currentBalanceRub: currentBalanceRub.toFixed(2),
    pendingPayoutKopecks: Math.max(0, balance?.pendingPayout ?? 0) * 100,
    accruedNetKopecks: Math.max(0, balance?.accruedNet ?? 0) * 100,
    commissionPercent: balance?.commissionPercent ?? 25,
  });
}
