/**
 * B478 — одностороннее «Сообщение клиенту» (сервисный артефакт, ОРИ-safe:
 * без ответной ветки; ответ клиента — на следующей сессии).
 *
 * POST { clientId, text, attachmentUrl?, attachmentName?, bookingId? }
 *   — практик отправляет материал СВОЕМУ клиенту; клиент получает уведомление
 *     (PRACTITIONER_MESSAGE) и читает в «Ещё → Сообщения».
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { notify } from "@/lib/notifications";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true, user: { select: { name: true } } },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const clientId = typeof body?.clientId === "string" ? body.clientId : null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!clientId) return NextResponse.json({ error: "clientId обязателен" }, { status: 400 });
  if (text.length < 2) return NextResponse.json({ error: "Напишите сообщение" }, { status: 400 });

  const relationship = await db.booking.findFirst({
    where: { practitionerId: practitioner.id, clientId },
    select: { id: true },
  });
  if (!relationship) {
    return NextResponse.json({ error: "Сообщение можно отправить только своему клиенту" }, { status: 403 });
  }

  const attachmentUrl = typeof body?.attachmentUrl === "string" && body.attachmentUrl.startsWith("/uploads/")
    ? body.attachmentUrl
    : null;
  const attachmentName = attachmentUrl && typeof body?.attachmentName === "string"
    ? body.attachmentName.trim().slice(0, 200) || null
    : null;
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId : null;
  if (bookingId) {
    const owns = await db.booking.findFirst({
      where: { id: bookingId, practitionerId: practitioner.id, clientId },
      select: { id: true },
    });
    if (!owns) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  }

  const message = await db.practitionerClientMessage.create({
    data: {
      practitionerId: practitioner.id,
      clientId,
      bookingId,
      text,
      attachmentUrl,
      attachmentName,
    },
    select: { id: true, sentAt: true },
  });

  notify({
    userId: clientId,
    event: "PRACTITIONER_MESSAGE",
    data: {
      practitionerName: practitioner.user.name ?? "Ваш специалист",
      preview: text.slice(0, 80),
      href: `/cabinet/messages/${message.id}`,
    },
    dedupeKey: `practitioner-message:${message.id}`,
  }).catch((e) => log.error("practitioner-message.notify_failed", { messageId: message.id, err: e }));

  return NextResponse.json({ ok: true, messageId: message.id, sentAt: message.sentAt.toISOString() });
}
