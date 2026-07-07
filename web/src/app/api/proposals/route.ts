/**
 * B480 — предложения сессий для КЛИЕНТА: GET возвращает открытые предложения
 * от специалистов (принятие → POST /api/bookings { proposalId } с оплатой).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const proposals = await db.bookingProposal.findMany({
    where: { clientId: session.user.id, status: "PENDING", startAt: { gt: new Date() } },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      startAt: true,
      durationMin: true,
      priceRub: true,
      message: true,
      createdAt: true,
      practitioner: { select: { id: true, slug: true, user: { select: { name: true } } } },
    },
  });

  return NextResponse.json({
    ok: true,
    proposals: proposals.map((p) => ({
      id: p.id,
      startAt: p.startAt.toISOString(),
      durationMin: p.durationMin,
      priceRub: p.priceRub,
      message: p.message,
      practitioner: { id: p.practitioner.id, name: p.practitioner.user.name ?? "Специалист" },
    })),
  });
}
