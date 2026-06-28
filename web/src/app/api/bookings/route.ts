import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { BookingStatus } from "@prisma/client";
import {
  sendBookingRequestedClient,
  sendBookingRequestedPractitioner,
  sendBookingConfirmedClient,
  sendBookingConfirmedPractitioner,
  sendBookingCancelledClient,
  sendBookingCancelledPractitioner,
  sendReviewRequestClient,
} from "@/lib/email";
import { getSetting } from "@/lib/platform-settings";
import { notify } from "@/lib/notifications";
import { holdSessionForBooking, startSessionForBooking, cancelSessionHold } from "@/lib/session-payment";
import { completeBookingAtSessionEnd } from "@/lib/session-complete";
import { markChannelConversion } from "@/lib/channel-attribution";
import { logFraudEvent, requestFingerprint } from "@/lib/antifraud";
import { assessBookingRisk } from "@/lib/practitioner-antifraud";
import { assertPractitionerBookingAllowed } from "@/lib/practitioner-compliance";
import { finalizeByocBookingAttribution, resolveByocBookingCommission } from "@/lib/byoc";
import { trackServerEvent } from "@/lib/analytics";
import { log } from "@/lib/logger";
import { APP_URL } from "@/lib/env";
import { getUserActivePlan } from "@/lib/entitlements";
import { bookingPriorityForPlan, canAccessPrioritySlot, promoteWaitlistForReleasedSlot } from "@/lib/priority-booking";
import { validateMeetingContext } from "@/lib/booking-context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSlot(slot: { startAt: Date; endAt: Date } | null): string {
  if (!slot) return "время уточняется";
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" };
  const start = new Date(slot.startAt).toLocaleString("ru-RU", opts);
  const endTime = new Date(slot.endAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${start} – ${endTime}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatBooking(b: any) {
  const appUrl = APP_URL;
  const showVideo = ["CONFIRMED", "IN_PROGRESS"].includes(b.status);
  return {
    id: b.id,
    status: b.status,
    priceRub: b.priceRub,
    createdAt: b.createdAt?.toISOString?.() ?? b.createdAt,
    updatedAt: b.updatedAt?.toISOString?.() ?? b.updatedAt,
    slot: b.slot ? { startAt: b.slot.startAt?.toISOString?.() ?? b.slot.startAt, endAt: b.slot.endAt?.toISOString?.() ?? b.slot.endAt } : null,
    sessionUrl: showVideo ? `${appUrl}/session/${b.id}` : null,
    client:      b.client      ? { name: b.client.name,           email: b.client.email }           : undefined,
    practitioner: b.practitioner ? { name: b.practitioner.user?.name, id: b.practitioner.id }       : undefined,
  };
}

// ─── GET /api/bookings ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const role = req.nextUrl.searchParams.get("role") ?? "client";
  const requestedUserId = req.nextUrl.searchParams.get("userId");
  const isAdminRequester = ["ADMIN", "SUPERADMIN"].includes(session.user?.role ?? "");

  try {
    let bookings;

    if (role === "practitioner") {
      if (session.user?.role !== "PRACTITIONER") return NextResponse.json({ bookings: [] });
      const prac = await db.practitioner.findUnique({ where: { userId: session.user.id } });
      if (!prac) return NextResponse.json({ bookings: [] });

      bookings = await db.booking.findMany({
        where: { practitionerId: prac.id },
        include: { client: { select: { name: true, email: true } }, slot: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } else if (role === "admin") {
      if (!isAdminRequester || !requestedUserId) return NextResponse.json({ bookings: [] });

      bookings = await db.booking.findMany({
        where: { clientId: requestedUserId },
        include: {
          practitioner: { include: { user: { select: { name: true } } } },
          slot: true,
        },
        orderBy: [
          { slot: { startAt: "asc" } },
          { createdAt: "desc" },
        ],
        take: 100,
      });
    } else {
      bookings = await db.booking.findMany({
        where: { clientId: session.user.id },
        include: {
          practitioner: { include: { user: { select: { name: true } } } },
          slot: true,
        },
        orderBy: [
          { slot: { startAt: "asc" } },
          { createdAt: "desc" },
        ],
        take: 100,
      });
    }

    return NextResponse.json({ bookings: bookings.map(formatBooking) });
  } catch (err) {
    log.error("api.bookings.get", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// ─── POST /api/bookings ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const userRole = session.user?.role;
  if (userRole === "PRACTITIONER" || userRole === "ADMIN" || userRole === "SUPERADMIN") {
    return NextResponse.json({ error: "Только клиенты могут создавать бронирования" }, { status: 403 });
  }

  try {
    const { practitionerId, slotId, slotStartAt, slotEndAt, priceOverride, meetingContext } = await req.json();
    if (!practitionerId) return NextResponse.json({ error: "practitionerId обязателен" }, { status: 400 });

    const practitioner = await db.practitioner.findUnique({
      where: { id: practitionerId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!practitioner) return NextResponse.json({ error: "Практик не найден" }, { status: 404 });
    if (practitioner.status !== "ACTIVE") {
      return NextResponse.json({ error: "Практик временно недоступен" }, { status: 409 });
    }
    const commercialGate = await assertPractitionerBookingAllowed(practitionerId);
    if (!commercialGate.allowed) {
      return NextResponse.json(
        { error: "Запись к практику временно недоступна до проверки документов и реквизитов", reasons: commercialGate.reasons },
        { status: 409 },
      );
    }
    // Механика 10: an unverified (but ACTIVE) practitioner can still be booked;
    // the profile page surfaces a "не верифицирован" badge so the client knows.

    // B379/B458 (item 14): «контекст встречи» нормализуем на границе и делаем
    // ОБЯЗАТЕЛЬНЫМ при первой записи к специалисту (та же ветка, что askContext
    // на профиле). Повторная запись к тому же специалисту — контекст необязателен.
    const priorBooking = await db.booking.findFirst({
      where: { clientId: session.user.id, practitionerId },
      select: { id: true },
    });
    const contextCheck = validateMeetingContext(meetingContext, { required: !priorBooking });
    if (!contextCheck.ok) {
      return NextResponse.json({ error: contextCheck.error }, { status: 400 });
    }
    const cleanMeetingContext = contextCheck.value;

    const activePlan = await getUserActivePlan(session.user.id).catch(() => null);
    const bookingPriority = bookingPriorityForPlan(activePlan);

    const fingerprint = requestFingerprint(req);
    const bookingRisk = await db.$transaction((tx) => assessBookingRisk({
      tx,
      clientId: session.user.id,
      practitionerId,
      fingerprint,
    }));
    if (bookingRisk.shouldBlock) {
      await db.$transaction((tx) => logFraudEvent(tx, {
        subjectType: "practitioner",
        subjectId: practitionerId,
        actorUserId: session.user.id,
        action: "practitioner_booking_blocked",
        status: "blocked",
        riskScore: bookingRisk.riskScore,
        riskFlags: bookingRisk.riskFlags,
        ...fingerprint,
        metadata: { practitionerId },
      }));
      return NextResponse.json({ error: "Запись требует проверки поддержки" }, { status: 409 });
    }
    const byocCommission = await db.$transaction((tx) => resolveByocBookingCommission({
      tx,
      request: req,
      clientId: session.user.id,
      practitionerId,
    }));
    if (byocCommission.shouldBlock) {
      return NextResponse.json({ error: "BYOC-запись требует проверки поддержки" }, { status: 409 });
    }

    let resolvedSlotId: string | null = null;

    // Вариант 1: слот уже есть в TimeSlot (создан практиком)
    if (slotId) {
      const slot = await db.timeSlot.findUnique({ where: { id: slotId } });
      if (!slot || !slot.available) {
        return NextResponse.json({ error: "Слот уже занят — выберите другое время" }, { status: 409 });
      }
      if (!canAccessPrioritySlot(slot, activePlan)) {
        return NextResponse.json({ error: "Этот слот раннего доступа доступен только Premium" }, { status: 403 });
      }
      await db.timeSlot.update({ where: { id: slotId }, data: { available: false } });
      resolvedSlotId = slotId;
    }
    // Вариант 2: клиент выбрал сгенерированный слот — создаём TimeSlot на сервере
    else if (slotStartAt && slotEndAt) {
      const requestedStartAt = new Date(slotStartAt);
      const requestedEndAt = new Date(slotEndAt);
      const overlappingAvailableSlot = await db.timeSlot.findFirst({
        where: {
          practitionerId,
          available: true,
          startAt: { lt: requestedEndAt },
          endAt: { gt: requestedStartAt },
        },
      });
      if (overlappingAvailableSlot) {
        if (!canAccessPrioritySlot(overlappingAvailableSlot, activePlan)) {
          return NextResponse.json({ error: "Этот слот раннего доступа доступен только Premium" }, { status: 403 });
        }
        if (
          overlappingAvailableSlot.startAt.getTime() !== requestedStartAt.getTime()
          || overlappingAvailableSlot.endAt.getTime() !== requestedEndAt.getTime()
        ) {
          return NextResponse.json({ error: "Слот пересекается с другим окном — выберите другое время" }, { status: 409 });
        }
        await db.timeSlot.update({ where: { id: overlappingAvailableSlot.id }, data: { available: false } });
        resolvedSlotId = overlappingAvailableSlot.id;
      } else {
        // Проверяем, нет ли уже активного бронирования на это время
        // Баг 15: strict bounds — touching intervals (a 14:00–15:00 booking and
        // a 15:00–16:00 request) must NOT count as a conflict. Inclusive lte/gte
        // wrongly blocked the adjacent slot.
        const existingBooking = await db.booking.findFirst({
          where: {
            practitionerId,
            status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
            slot: {
              startAt: { lt: requestedEndAt },
              endAt: { gt: requestedStartAt },
            },
          },
        });
        if (existingBooking) {
          return NextResponse.json({ error: "Слот уже занят — выберите другое время" }, { status: 409 });
        }

        // Также проверяем, нет ли уже занятого TimeSlot на это время
        const existingSlot = await db.timeSlot.findFirst({
          where: {
            practitionerId,
            available: false,
            startAt: { lt: requestedEndAt },
            endAt: { gt: requestedStartAt },
          },
        });
        if (existingSlot) {
          return NextResponse.json({ error: "Слот уже занят — выберите другое время" }, { status: 409 });
        }

        const createdSlot = await db.timeSlot.create({
          data: {
            practitionerId,
            startAt: requestedStartAt,
            endAt: requestedEndAt,
            available: false, // сразу резервируем
          },
        });
        resolvedSlotId = createdSlot.id;
      }
    }

    // Цена: priceOverride (из тарифной сетки) или базовая цена практика
    const testMode = await getSetting("session.test_mode") === "true";
    let priceRub = priceOverride ?? practitioner.pricePerSession;
    if (testMode) priceRub = 0;

    const booking = await db.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          clientId: session.user.id,
          practitionerId,
          slotId: resolvedSlotId,
          status: BookingStatus.PENDING,
          priceRub,
          meetingContext: cleanMeetingContext,
          source: byocCommission.source,
          referrerPractitionerId: byocCommission.referrerPractitionerId,
          commissionPercentApplied: byocCommission.commissionPercentApplied,
          priority: bookingPriority,
          ...fingerprint,
          riskScore: bookingRisk.riskScore,
          riskFlags: Array.from(new Set([...bookingRisk.riskFlags, ...byocCommission.riskFlags])),
        },
        include: {
          client: { select: { name: true, email: true } },
          slot: true,
        },
      });
      await finalizeByocBookingAttribution({
        tx,
        clientId: session.user.id,
        practitionerId,
        source: byocCommission.source,
        firstTouchInviteId: byocCommission.firstTouchInviteId,
      });
      return created;
    });

    if (bookingRisk.shouldReview) {
      await db.$transaction((tx) => logFraudEvent(tx, {
        subjectType: "booking",
        subjectId: booking.id,
        actorUserId: session.user.id,
        action: "practitioner_booking_review",
        status: "review",
        riskScore: bookingRisk.riskScore,
        riskFlags: bookingRisk.riskFlags,
        ...fingerprint,
        metadata: { practitionerId },
      }));
    }

    trackServerEvent(db, {
      event: "booking_created",
      userId: session.user.id,
      surface: "practitioners",
      properties: {
        practitioner_id: practitionerId,
        price_rub: String(priceRub),
        priority: String(bookingPriority),
        plan: activePlan?.key ?? "free",
      },
    });

    // Собираем данные для писем
    const emailData = {
      bookingId: booking.id,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      practitionerName: practitioner.user.name,
      practitionerEmail: practitioner.user.email,
      practitionerId,
      slotStr: fmtSlot(booking.slot),
      priceRub: practitioner.pricePerSession,
      durationMin: practitioner.sessionDuration ?? 60,
    };

    // Email + Telegram уведомления (параллельно, не блокируем ответ)
    const slotDate = booking.slot ? new Date(booking.slot.startAt).toLocaleDateString("ru-RU") : "—";
    const slotTime = booking.slot ? new Date(booking.slot.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
    Promise.allSettled([
      sendBookingRequestedClient(emailData),
      sendBookingRequestedPractitioner(emailData),
      // Telegram: новая запись — уведомить практика (userId, не practitionerId)
      notify({ userId: practitioner.userId, event: "BOOKING_REQUESTED", data: {
        clientName: booking.client.name, date: slotDate, time: slotTime,
      }}),
      markChannelConversion({
        request: req,
        userId: session.user.id,
        conversionType: "booking_requested",
        conversionId: booking.id,
      }),
    ]).then((results) => {
      results.forEach((r, i) => {
        if (r.status === "rejected") log.error("bookings.post.notify_failed", { idx: i, err: r.reason });
      });
    });

    // Z1a/B425: двухстадийный hold оплаты сессии — деньги резервируются на карте при
    // брони и списываются после сессии + 24h dispute-window. Бесплатная
    // сессия (test mode / priceRub=0) → hold "free", confirmationUrl не нужен.
    let confirmationUrl: string | null = null;
    let heldViaSavedCard = false;
    try {
      const hold = await holdSessionForBooking({
        bookingId: booking.id,
        priceRub,
        clientId: session.user.id,
        description: `Сессия с ${practitioner.user.name ?? "специалистом"}`,
      });
      if (hold.status === "held") {
        confirmationUrl = hold.confirmationUrl || null;
        heldViaSavedCard = hold.viaSavedCard;
        // Баг 16: при одно-таповом холде по карте клиент уже «оплатил» (средства
        // зарезервированы) — уведомляем его, что оплата прошла, без редиректа.
        if (hold.viaSavedCard) {
          notify({ userId: session.user.id, event: "PAYMENT_RECEIVED", data: {
            amountRub: priceRub.toLocaleString("ru-RU"), date: slotDate,
          }}).catch((e: unknown) => log.error("bookings.post.hold_notify_failed", { bookingId: booking.id, err: e }));
        }
      }
    } catch (e) {
      log.error("bookings.post.hold_failed", { bookingId: booking.id, err: e });
    }

    return NextResponse.json({ booking: formatBooking(booking), confirmationUrl, heldViaSavedCard, ok: true });
  } catch (err) {
    log.error("api.bookings.post", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// ─── PATCH /api/bookings ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const { bookingId, status } = await req.json() as { bookingId: string; status: BookingStatus };
    if (!bookingId || !status) return NextResponse.json({ error: "bookingId и status обязательны" }, { status: 400 });

    // Validate status is a valid enum value
    const validStatuses = Object.values(BookingStatus);
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Недопустимый статус бронирования" }, { status: 400 });
    }

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: {
        practitioner: { include: { user: { select: { name: true, email: true } } } },
        client: { select: { name: true, email: true } },
        slot: true,
      },
    });
    if (!booking) return NextResponse.json({ error: "Бронирование не найдено" }, { status: 404 });

    const userRole = session.user?.role;
    const isPractitioner = booking.practitioner.userId === session.user.id
      || (userRole === "PRACTITIONER" && booking.practitioner.userId === session.user.id);
    const isClient = booking.clientId === session.user.id;
    const isAdmin = userRole === "ADMIN" || userRole === "SUPERADMIN";

    if (!isPractitioner && !isClient && !isAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    // Клиент может только отменить
    if (isClient && !isAdmin && status !== "CANCELLED") {
      return NextResponse.json({ error: "Клиент может только отменить запись" }, { status: 403 });
    }

    // При переходе в IN_PROGRESS — стартуем сессию без capture; capture будет после 24h dispute-window.
    if (status === "IN_PROGRESS" && booking.status === "CONFIRMED") {
      const outcome = await startSessionForBooking(bookingId);
      if (outcome.status === "hold_missing") {
        return NextResponse.json(
          { error: "Оплата сессии не подтверждена — авторизуйте платёж по карте." },
          { status: 402 },
        );
      }
      if (outcome.status === "invalid_status") {
        return NextResponse.json({ error: "Сессия в неподходящем статусе для запуска" }, { status: 409 });
      }

      const updatedBooking = await db.booking.findUnique({
        where: { id: bookingId },
        include: {
          practitioner: { include: { user: { select: { name: true, email: true } } } },
          client: { select: { name: true, email: true } },
          slot: true,
        },
      });
      return NextResponse.json({ booking: formatBooking({ ...updatedBooking, client: booking.client, practitioner: booking.practitioner }) });
    }

    // При переходе в COMPLETED — создаём выплату практику и обновляем счётчик
    if (status === "COMPLETED") {
      const outcome = await completeBookingAtSessionEnd(bookingId, {
        userId: session.user.id,
        isPractitioner: booking.practitioner.userId === session.user.id,
      });
      if (outcome.status === "not_found") {
        return NextResponse.json({ error: "Бронирование не найдено" }, { status: 404 });
      }
      if (outcome.status === "early_end_blocked") {
        const minutesLeft = Math.ceil((outcome.requiredMs - outcome.elapsedMs) / 60000);
        return NextResponse.json(
          { error: `Сессию можно завершить после 75% времени. Осталось ~${minutesLeft} мин` },
          { status: 400 },
        );
      }
      if (outcome.status === "invalid_status") {
        return NextResponse.json(
          { error: `Нельзя завершить сессию из статуса ${outcome.currentStatus}` },
          { status: 409 },
        );
      }

      // Отправляем запрос на отзыв
      sendReviewRequestClient({
        bookingId,
        clientName: booking.client.name,
        clientEmail: booking.client.email,
        practitionerName: booking.practitioner.user.name,
        practitionerEmail: booking.practitioner.user.email,
        practitionerId: booking.practitioner.id,
        slotStr: fmtSlot(booking.slot),
        priceRub: booking.priceRub,
        durationMin: 60,
      }).catch((e) => log.error("bookings.patch.review_email_failed", { err: e }));

      const updatedBooking = await db.booking.findUnique({
        where: { id: bookingId },
        include: {
          practitioner: { include: { user: { select: { name: true, email: true } } } },
          client: { select: { name: true, email: true } },
          slot: true,
        },
      });
      return NextResponse.json({ booking: formatBooking({ ...updatedBooking, client: booking.client, practitioner: booking.practitioner }) });
    }

    const updated = await db.booking.update({
      where: { id: bookingId },
      data: { status },
      include: { slot: true },
    });

    // Освобождаем слот если бронирование отменено
    if (status === "CANCELLED" && booking.slotId) {
      await db.timeSlot.update({ where: { id: booking.slotId }, data: { available: true } }).catch(() => {});
      await promoteWaitlistForReleasedSlot({ slotId: booking.slotId, actorUserId: session.user.id })
        .catch((e: unknown) => log.error("bookings.patch.waitlist_promotion_failed", { bookingId, slotId: booking.slotId, err: e }));
    }
    // Z1a: отменяем карт-холд при отмене брони (если ещё не захвачен).
    if (status === "CANCELLED") {
      await cancelSessionHold(bookingId).catch((e) => log.error("bookings.patch.cancel_hold_failed", { bookingId, err: e }));
    }

    const appUrl = APP_URL;
    const emailData = {
      bookingId,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      practitionerName: booking.practitioner.user.name,
      practitionerEmail: booking.practitioner.user.email,
      practitionerId: booking.practitioner.id,
      slotStr: fmtSlot(booking.slot),
      priceRub: booking.priceRub,
      durationMin: 60, // TODO: from practitioner.sessionDuration
      sessionUrl: `${appUrl}/session/${bookingId}`,
    };

    // Email + Telegram по статусу
    if (status === "CONFIRMED") {
      const slotDate = booking.slot ? new Date(booking.slot.startAt).toLocaleDateString("ru-RU") : "—";
      const slotTime = booking.slot ? new Date(booking.slot.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
      Promise.allSettled([
        sendBookingConfirmedClient(emailData),
        sendBookingConfirmedPractitioner(emailData),
        // Практик: Telegram
        notify({ userId: booking.practitioner.userId, event: "BOOKING_CONFIRMED", data: {
          clientName: booking.client.name,
          practitionerName: booking.practitioner.user.name,
          date: slotDate,
          time: slotTime,
          sessionUrl: emailData.sessionUrl,
        }}),
      ]).then((results) => {
        results.forEach((r, i) => {
          if (r.status === "rejected") log.error("bookings.patch.notify_failed", { idx: i, err: r.reason });
        });
      });
    } else if (status === "CANCELLED") {
      const cancelledBy = isClient ? "client" : "practitioner";
      Promise.allSettled([
        sendBookingCancelledClient(emailData, cancelledBy),
        isClient ? sendBookingCancelledPractitioner(emailData) : Promise.resolve(),
      ]).catch(() => {});
    }

    return NextResponse.json({ booking: formatBooking({ ...updated, client: booking.client, practitioner: booking.practitioner }) });
  } catch (err) {
    log.error("api.bookings.patch", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
