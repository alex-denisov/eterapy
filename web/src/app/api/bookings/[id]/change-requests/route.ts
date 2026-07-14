/**
 * B481 — запросы переноса/отмены подтверждённой сессии.
 *
 * POST { type: "RESCHEDULE"|"CANCEL", proposedStartAt?, reason? }
 *   — клиент-владелец ИЛИ практик-владелец брони создаёт запрос; другая
 *     сторона получает уведомление (BOOKING_CHANGE_REQUESTED) и согласовывает.
 *     Штраф применяется ТОЛЬКО к клиентской отмене <24ч (booking-change-rules);
 *     практик может простить его при согласовании.
 * GET — список запросов по брони (обе стороны).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { notify } from "@/lib/notifications";
import { log } from "@/lib/logger";
import {
  penaltyAppliesFor,
  type ChangeRequestType,
} from "@/lib/booking-change-rules";

const FMT_DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const FMT_TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

async function loadBookingForParty(bookingId: string, userId: string, role: string | undefined) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      slot: true,
      client: { select: { id: true, name: true } },
      practitioner: { select: { id: true, userId: true, user: { select: { name: true } } } },
    },
  });
  if (!booking) return { booking: null, party: null } as const;
  if (booking.clientId === userId) return { booking, party: "CLIENT" as const };
  if (role === "PRACTITIONER" && booking.practitioner.userId === userId) {
    return { booking, party: "PRACTITIONER" as const };
  }
  return { booking, party: null } as const;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const { booking, party } = await loadBookingForParty(id, session.user.id, session.user.role);
  if (!booking) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (!party) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  if (!["CONFIRMED", "PENDING"].includes(booking.status)) {
    return NextResponse.json({ error: "Перенести или отменить можно только предстоящую сессию" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const type = body?.type === "CANCEL" ? "CANCEL" : body?.type === "RESCHEDULE" ? "RESCHEDULE" : null;
  if (!type) return NextResponse.json({ error: "Укажите тип: перенос или отмена" }, { status: 400 });

  let proposedStartAt: Date | null = null;
  let proposedDurationMin: number | null = null;
  if (type === "RESCHEDULE") {
    proposedStartAt = body?.proposedStartAt ? new Date(body.proposedStartAt) : null;
    if (!proposedStartAt || Number.isNaN(proposedStartAt.getTime()) || proposedStartAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Выберите новое время в будущем" }, { status: 400 });
    }
    proposedDurationMin = booking.slot
      ? Math.round((booking.slot.endAt.getTime() - booking.slot.startAt.getTime()) / 60000)
      : 50;
  }

  const openExisting = await db.bookingChangeRequest.findFirst({
    where: { bookingId: booking.id, status: "PENDING" },
    select: { id: true },
  });
  if (openExisting) {
    return NextResponse.json({ error: "По этой сессии уже есть открытый запрос — дождитесь решения" }, { status: 409 });
  }

  // B512 §3.6 — bounded reschedule cycle: у каждой стороны ОДНО предложение
  // переноса на цикл. Если ваше предложение отклонили — контр-предложений нет
  // (получатель только принимает/отклоняет). Одобренный перенос начинает новый
  // цикл: пересенесённую сессию при необходимости можно переносить снова.
  if (type === "RESCHEDULE") {
    const lastApproved = await db.bookingChangeRequest.findFirst({
      where: { bookingId: booking.id, type: "RESCHEDULE", status: "APPROVED" },
      orderBy: { resolvedAt: "desc" },
      select: { resolvedAt: true },
    });
    const declinedThisCycle = await db.bookingChangeRequest.count({
      where: {
        bookingId: booking.id,
        initiatedBy: party,
        type: "RESCHEDULE",
        status: "DECLINED",
        ...(lastApproved?.resolvedAt ? { resolvedAt: { gt: lastApproved.resolvedAt } } : {}),
      },
    });
    if (declinedThisCycle >= 1) {
      return NextResponse.json(
        { error: "Ваше предложение переноса уже отклонили. Дождитесь встречного предложения, договоритесь о времени напрямую или отмените сессию." },
        { status: 409 },
      );
    }
  }

  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : null;
  const penaltyApplies = penaltyAppliesFor({
    initiatedBy: party,
    type: type as ChangeRequestType,
    slotStartAt: booking.slot?.startAt ?? null,
  });

  const request = await db.bookingChangeRequest.create({
    data: {
      bookingId: booking.id,
      initiatedBy: party,
      type,
      proposedStartAt,
      proposedDurationMin,
      reason,
      penaltyApplies,
    },
  });

  // Уведомляем другую сторону.
  const otherUserId = party === "CLIENT" ? booking.practitioner.userId : booking.clientId;
  const byName = party === "CLIENT"
    ? booking.client.name ?? "Клиент"
    : booking.practitioner.user.name ?? "Специалист";
  const date = booking.slot ? FMT_DAY.format(booking.slot.startAt) : "—";
  const time = booking.slot ? FMT_TIME.format(booking.slot.startAt) : "—";
  notify({
    userId: otherUserId,
    event: "BOOKING_CHANGE_REQUESTED",
    data: {
      type,
      byName,
      date,
      time,
      proposed: proposedStartAt ? `${FMT_DAY.format(proposedStartAt)} ${FMT_TIME.format(proposedStartAt)}` : "",
      href: party === "CLIENT"
        ? "/cabinet/practitioner/calendar?tab=requests"
        : "/cabinet/bookings",
    },
    dedupeKey: `change-request:${request.id}`,
  }).catch((e) => log.error("booking.change_request_notify_failed", { requestId: request.id, err: e }));

  return NextResponse.json({ ok: true, request: { id: request.id, status: request.status, penaltyApplies } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const { booking, party } = await loadBookingForParty(id, session.user.id, session.user.role);
  if (!booking) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (!party) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const requests = await db.bookingChangeRequest.findMany({
    where: { bookingId: booking.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      initiatedBy: true,
      type: true,
      proposedStartAt: true,
      reason: true,
      penaltyApplies: true,
      penaltyWaived: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
    },
  });
  return NextResponse.json({ ok: true, requests });
}
