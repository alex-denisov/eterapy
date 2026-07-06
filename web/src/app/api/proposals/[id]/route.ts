/**
 * B480 — ответ клиента на предложение сессии без оплаты: отклонить.
 * (Принятие идёт через POST /api/bookings { proposalId } — там же оплата.)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const proposal = await db.bookingProposal.findUnique({
    where: { id },
    select: { id: true, clientId: true, status: true },
  });
  if (!proposal) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (proposal.clientId !== session.user.id) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (proposal.status !== "PENDING") return NextResponse.json({ error: "Предложение уже неактуально" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  if (body?.action !== "decline") return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });

  await db.bookingProposal.update({
    where: { id },
    data: { status: "DECLINED", resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: true, status: "DECLINED" });
}
