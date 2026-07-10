/**
 * B480 — «Записать»: практик предлагает клиенту время сессии.
 *
 * POST { clientId, startAt, durationMin, message? }
 *   — создаёт BookingProposal (цена берётся из PriceRate практика для этой
 *     длительности — в кабинете цены не редактируются) + уведомляет клиента
 *     (BOOKING_PROPOSED). Клиент подтверждает и ОПЛАЧИВАЕТ в своих «Записях» —
 *     принятие создаёт обычную бронь через POST /api/bookings { proposalId }.
 * GET — предложения практика (последние 20).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { notify } from "@/lib/notifications";
import { log } from "@/lib/logger";
import { normalizeBookingFormat } from "@/lib/session-formats";

const FMT_DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const FMT_TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true, formats: true, user: { select: { name: true } } },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const clientId = typeof body?.clientId === "string" ? body.clientId : null;
  const startAt = body?.startAt ? new Date(body.startAt) : null;
  const durationMin = Number(body?.durationMin);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) || null : null;
  // B466/B480: формат сессии — только из предлагаемых практиком (иначе individual).
  const format = normalizeBookingFormat(body?.format, practitioner.formats);

  if (!clientId) return NextResponse.json({ error: "Выберите клиента" }, { status: 400 });
  if (!startAt || Number.isNaN(startAt.getTime()) || startAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Выберите время в будущем" }, { status: 400 });
  }
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    return NextResponse.json({ error: "Выберите длительность" }, { status: 400 });
  }

  // Предлагать можно ТОЛЬКО своему клиенту (была хотя бы одна бронь).
  const relationship = await db.booking.findFirst({
    where: { practitionerId: practitioner.id, clientId },
    select: { id: true },
  });
  if (!relationship) {
    return NextResponse.json({ error: "Записать можно только клиента, с которым уже была сессия" }, { status: 403 });
  }

  // Цена — из тарифной сетки практика (в кабинете не редактируется).
  const rate = await db.priceRate.findUnique({
    where: { practitionerId_durationMin: { practitionerId: practitioner.id, durationMin } },
    select: { priceRub: true, enabled: true },
  });
  if (!rate || !rate.enabled) {
    return NextResponse.json({ error: "Эта длительность отключена в вашей доступности" }, { status: 400 });
  }

  const openExisting = await db.bookingProposal.findFirst({
    where: { practitionerId: practitioner.id, clientId, status: "PENDING" },
    select: { id: true },
  });
  if (openExisting) {
    return NextResponse.json({ error: "У клиента уже есть открытое предложение — дождитесь ответа" }, { status: 409 });
  }

  const proposal = await db.bookingProposal.create({
    data: {
      practitionerId: practitioner.id,
      clientId,
      startAt,
      durationMin,
      priceRub: rate.priceRub,
      message,
      format,
    },
  });

  notify({
    userId: clientId,
    event: "BOOKING_PROPOSED",
    data: {
      practitionerName: practitioner.user.name ?? "Специалист",
      date: FMT_DAY.format(startAt),
      time: FMT_TIME.format(startAt),
    },
    dedupeKey: `proposal:${proposal.id}`,
  }).catch((e) => log.error("proposal.notify_failed", { proposalId: proposal.id, err: e }));

  return NextResponse.json({ ok: true, proposal: { id: proposal.id, status: proposal.status } });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const proposals = await db.bookingProposal.findMany({
    where: { practitionerId: practitioner.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      clientId: true,
      startAt: true,
      durationMin: true,
      priceRub: true,
      status: true,
      createdAt: true,
      client: { select: { name: true, email: true } },
    },
  });
  return NextResponse.json({ ok: true, proposals });
}
