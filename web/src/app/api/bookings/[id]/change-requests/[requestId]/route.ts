/**
 * B481 — решение по запросу переноса/отмены.
 *
 * PATCH { action: "approve" | "decline" | "withdraw", waivePenalty? }
 *   • approve/decline — ТОЛЬКО противоположная сторона;
 *   • withdraw — инициатор отзывает свой запрос;
 *   • approve CANCEL: бронь → CANCELLED, слот освобождается; деньги: полный
 *     возврат/отмена холда, при штрафе (клиентская отмена <24ч, не прощён) —
 *     частичный capture суммы штрафа (chargeCancellationPenalty);
 *   • approve RESCHEDULE: бронь переезжает на новый слот (создаём TimeSlot).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { notify } from "@/lib/notifications";
import { log } from "@/lib/logger";
import { isLateChange, penaltyKopecks, resolverFor } from "@/lib/booking-change-rules";
import {
  cancelSessionHold,
  refundSessionForBooking,
} from "@/lib/session-payment";
import { settleLateCancelPenalty } from "@/lib/booking-penalty";
import { handlePractitionerCancellation } from "@/lib/practitioner-reliability";
import { promoteWaitlistForReleasedSlot } from "@/lib/priority-booking";

const FMT_DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const FMT_TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id, requestId } = await params;
  const request = await db.bookingChangeRequest.findUnique({
    where: { id: requestId },
    include: {
      booking: {
        include: {
          slot: true,
          client: { select: { id: true, name: true } },
          practitioner: { select: { id: true, userId: true, user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!request || request.bookingId !== id) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "Запрос уже решён" }, { status: 409 });
  }

  const booking = request.booking;
  const party = booking.clientId === session.user.id
    ? "CLIENT"
    : session.user.role === "PRACTITIONER" && booking.practitioner.userId === session.user.id
      ? "PRACTITIONER"
      : null;
  if (!party) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = ["approve", "decline", "withdraw"].includes(body?.action) ? (body.action as string) : null;
  if (!action) return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });

  if (action === "withdraw") {
    if (party !== request.initiatedBy) {
      return NextResponse.json({ error: "Отозвать запрос может только его автор" }, { status: 403 });
    }
    await db.bookingChangeRequest.update({
      where: { id: request.id },
      data: { status: "WITHDRAWN", resolvedAt: new Date() },
    });
    return NextResponse.json({ ok: true, status: "WITHDRAWN" });
  }

  if (party !== resolverFor(request.initiatedBy as "CLIENT" | "PRACTITIONER")) {
    return NextResponse.json({ error: "Решение принимает другая сторона" }, { status: 403 });
  }

  const waivePenalty = Boolean(body?.waivePenalty);
  const approved = action === "approve";
  const date = booking.slot ? FMT_DAY.format(booking.slot.startAt) : "—";
  const time = booking.slot ? FMT_TIME.format(booking.slot.startAt) : "—";
  const proposed = request.proposedStartAt
    ? `${FMT_DAY.format(request.proposedStartAt)} ${FMT_TIME.format(request.proposedStartAt)}`
    : "";

  if (approved && request.type === "CANCEL") {
    const penalized = request.penaltyApplies && !waivePenalty;
    // B484: снимок «позднести» на момент отмены — slotId дальше отвязывается.
    const lateCancel = booking.slot ? isLateChange(new Date(booking.slot.startAt)) : false;
    await db.$transaction(async (tx) => {
      await tx.bookingChangeRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", penaltyWaived: request.penaltyApplies && waivePenalty, resolvedAt: new Date() },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "CANCELLED",
          cancelledBy: request.initiatedBy,
          cancelledAt: new Date(),
          cancelReason: request.reason,
          lateCancel,
          slotId: null,
        },
      });
      if (booking.slotId) {
        await tx.timeSlot.update({ where: { id: booking.slotId }, data: { available: true } }).catch(() => {});
      }
    });
    if (booking.slotId) {
      await promoteWaitlistForReleasedSlot({ slotId: booking.slotId, actorUserId: session.user.id })
        .catch((e: unknown) => log.error("change-request.waitlist_promotion_failed", { bookingId: booking.id, err: e }));
    }
    // Деньги: штраф (частичный capture, B481 — доля практика по комиссионной
    // матрице + расходная транзакция клиенту) или полное освобождение/возврат.
    if (penalized) {
      await settleLateCancelPenalty(booking.id, penaltyKopecks(booking.priceRub))
        .catch((e: unknown) => log.error("change-request.penalty_failed", { bookingId: booking.id, err: e }));
    } else {
      const hold = await cancelSessionHold(booking.id)
        .catch((e: unknown) => { log.error("change-request.hold_cancel_failed", { bookingId: booking.id, err: e }); return null; });
      if (hold?.status === "already_captured") {
        await refundSessionForBooking(booking.id, booking.priceRub * 100)
          .catch((e: unknown) => log.error("change-request.refund_failed", { bookingId: booking.id, err: e }));
      }
    }
    // B484: отмена по инициативе практика → метрика надёжности + гудвилл.
    if (request.initiatedBy === "PRACTITIONER") {
      await handlePractitionerCancellation({
        bookingId: booking.id,
        practitionerId: booking.practitioner.id,
        practitionerUserId: booking.practitioner.userId,
        practitionerName: booking.practitioner.user.name,
        clientId: booking.clientId,
        lateCancel,
      });
    }
  } else if (approved && request.type === "RESCHEDULE" && request.proposedStartAt) {
    const durationMin = request.proposedDurationMin ?? 50;
    const newEnd = new Date(request.proposedStartAt.getTime() + durationMin * 60000);
    await db.$transaction(async (tx) => {
      await tx.bookingChangeRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", resolvedAt: new Date() },
      });
      const oldSlotId = booking.slotId;
      const newSlot = await tx.timeSlot.create({
        data: {
          practitionerId: booking.practitionerId,
          startAt: request.proposedStartAt!,
          endAt: newEnd,
          available: false,
        },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: { slotId: newSlot.id, reminder24hSent: false, reminder1hSent: false },
      });
      if (oldSlotId) {
        await tx.timeSlot.update({ where: { id: oldSlotId }, data: { available: true } }).catch(() => {});
      }
    });
  } else {
    await db.bookingChangeRequest.update({
      where: { id: request.id },
      data: { status: "DECLINED", resolvedAt: new Date() },
    });
  }

  // Уведомляем инициатора о решении.
  const initiatorUserId = request.initiatedBy === "CLIENT" ? booking.clientId : booking.practitioner.userId;
  notify({
    userId: initiatorUserId,
    event: "BOOKING_CHANGE_RESOLVED",
    data: {
      type: request.type,
      approved: approved ? "1" : "0",
      date,
      time,
      proposed,
      href: request.initiatedBy === "CLIENT" ? "/cabinet/bookings" : "/cabinet/practitioner/calendar",
    },
    dedupeKey: `change-resolved:${request.id}`,
  }).catch((e) => log.error("change-request.resolved_notify_failed", { requestId: request.id, err: e }));

  return NextResponse.json({ ok: true, status: approved ? "APPROVED" : "DECLINED" });
}
