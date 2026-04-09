/**
 * GET /api/billing/balance
 * Возвращает текущий баланс пользователя в копейках и рублях.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { balance: true },
  });

  return NextResponse.json({
    balanceKopecks: user?.balance ?? 0,
    balanceRub: ((user?.balance ?? 0) / 100).toFixed(2),
  });
}
