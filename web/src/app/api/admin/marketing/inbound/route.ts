import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import db from "@/lib/db";

/**
 * B662 — «я уже ответил на это сам».
 *
 * Владелец 2026-08-05: во «Входящем» висело сообщение, на которое он ответил
 * руками несколько дней назад. Отметить это было нечем: статус двигали только
 * автоматические пути (агент ответил, сторож эскалировал), а живой человек,
 * закрывший разговор своими руками, оставался невидимым для системы. Из-за
 * этого одна закрытая переписка бесконечно числилась в работе и через сутки
 * попадала в сторож просроченного — сигнал, который ничего не значит.
 *
 * Ручная отметка — отдельный статус-переход, а не подделка автоматического:
 * `answeredAt` ставится, а в `lastError` пишется, кто и когда закрыл, чтобы
 * «ответил человек» и «ответил агент» не слипались в отчётах.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const status = typeof body?.status === "string" ? body.status : "ANSWERED";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (status !== "ANSWERED" && status !== "IGNORED") {
    return NextResponse.json({ error: "status must be ANSWERED or IGNORED" }, { status: 400 });
  }

  const existing = await db.marketingInboundMessage.findUnique({
    where: { id },
    select: { id: true, status: true, platform: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Входящее не найдено" }, { status: 404 });
  }

  const now = new Date();
  const updated = await db.marketingInboundMessage.update({
    where: { id },
    data: {
      status,
      answeredAt: status === "ANSWERED" ? now : null,
      lastError: status === "ANSWERED"
        ? `Закрыто вручную суперадминистратором ${now.toISOString()}`
        : `Помечено как не требующее ответа ${now.toISOString()}`,
    },
    select: { id: true, status: true },
  });

  // Сигналы сторожей (`inbound:sla`, `inbound:stale`) — сводные, по всей
  // очереди сразу. Закрытая строка выпадает из их выборки, и сигнал снимается
  // сам на ближайшем проходе; отдельного снятия здесь не нужно.

  await logAudit(
    session.user.id,
    AUDIT_ACTIONS.MARKETING_AGENT_STATE,
    `marketing.inbound.${id}`,
    `${existing.platform}: ${existing.status} → ${status} вручную`,
  );

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}
