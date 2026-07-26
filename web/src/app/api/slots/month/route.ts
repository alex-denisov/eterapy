import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { log } from "@/lib/logger";
import { dayHasAvailability, calendarDateStr, type SlotInterval } from "@/lib/slot-availability";
import { isDemoPractitioner } from "@/lib/practitioner-compliance";

/**
 * GET /api/slots/month?practitionerId=xxx&year=2026&month=5&durationMin=60
 *   (month — 0-based, как `Date.getMonth()`)
 *
 * B458 (walkthrough items 12–13). Возвращает дни запрошенного месяца, в которых
 * реально есть свободные слоты, плюс ближайшую доступную дату в пределах горизонта
 * — чтобы календарь подсвечивал только рабочие дни, авто-переходил на первый месяц
 * с записью и авто-выбирал ближайшую дату (слоты видны сразу, без клика).
 *
 * Логика дня та же, что в `/api/slots/available`: ScheduleRule минус BlockedSlot,
 * занятые Booking и недоступные TimeSlot; плюс одноразовые доступные TimeSlot.
 */

const HORIZON_DAYS = 92; // ~3 месяца — на сколько вперёд ищем ближайшую дату.

export async function GET(req: NextRequest) {
  const practitionerId = req.nextUrl.searchParams.get("practitionerId");
  const yearStr = req.nextUrl.searchParams.get("year");
  const monthStr = req.nextUrl.searchParams.get("month");
  const durationMin = Number(req.nextUrl.searchParams.get("durationMin") ?? 60);

  if (!practitionerId || yearStr === null || monthStr === null) {
    return NextResponse.json({ error: "practitionerId, year и month обязательны" }, { status: 400 });
  }
  const year = Number(yearStr);
  const month = Number(monthStr); // 0-based
  if (
    !Number.isInteger(year) || !Number.isInteger(month)
    || month < 0 || month > 11 || !Number.isFinite(durationMin) || durationMin <= 0
  ) {
    return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  }

  try {
    // B584: демо-профиль не отдаёт ни одного доступного дня — календарь
    // остаётся пустым, а не «подсвечивает ближайшую дату» к специалисту,
    // которого не существует.
    if (await isDemoPractitioner(practitionerId)) {
      return NextResponse.json({
        year,
        month,
        durationMin,
        availableDates: [],
        earliestAvailableDate: null,
        reason: "demo_account",
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthStartDate = new Date(year, month, 1);
    const monthEndDate = new Date(year, month + 1, 0); // последний день месяца
    const horizonEnd = new Date(todayStart);
    horizonEnd.setDate(horizonEnd.getDate() + HORIZON_DAYS);

    const fetchStart = new Date(Math.min(todayStart.getTime(), monthStartDate.getTime()));
    const fetchEnd = new Date(Math.max(monthEndDate.getTime(), horizonEnd.getTime()));
    const fetchStartFull = new Date(fetchStart.getFullYear(), fetchStart.getMonth(), fetchStart.getDate(), 0, 0, 0);
    const fetchEndFull = new Date(fetchEnd.getFullYear(), fetchEnd.getMonth(), fetchEnd.getDate(), 23, 59, 59);

    const [rules, blocked, bookedSlots, unavailableSlots, persistedAvailableSlots] = await Promise.all([
      db.scheduleRule.findMany({ where: { practitionerId } }),
      db.blockedSlot.findMany({
        where: { practitionerId, startAt: { lte: fetchEndFull }, endAt: { gte: fetchStartFull } },
      }),
      db.booking.findMany({
        where: {
          practitionerId,
          status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
          slot: { startAt: { gte: fetchStartFull, lte: fetchEndFull } },
        },
        include: { slot: true },
      }),
      db.timeSlot.findMany({
        where: { practitionerId, available: false, startAt: { gte: fetchStartFull, lte: fetchEndFull } },
      }),
      db.timeSlot.findMany({
        where: { practitionerId, available: true, startAt: { gte: fetchStartFull, lte: fetchEndFull } },
      }),
    ]);

    const ruleByDow = new Map<number, (typeof rules)[number]>();
    for (const r of rules) ruleByDow.set(r.dayOfWeek, r);

    const bookedIntervals: SlotInterval[] = bookedSlots
      .filter((b) => b.slot)
      .map((b) => ({ startAt: b.slot!.startAt, endAt: b.slot!.endAt }));

    const isDayAvailable = (d: Date): boolean => {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
      const inDay = (s: SlotInterval) => s.startAt.getTime() <= dayEnd && s.endAt.getTime() >= dayStart;
      return dayHasAvailability({
        dateStr: calendarDateStr(d.getFullYear(), d.getMonth(), d.getDate()),
        rule: ruleByDow.get(d.getDay()),
        durationMin,
        blocked: blocked.filter(inDay),
        booked: bookedIntervals.filter(inDay),
        unavailable: unavailableSlots.filter(inDay),
        persistedAvailable: persistedAvailableSlots.filter(inDay),
        now,
      });
    };

    // Доступные дни запрошенного месяца (прошедшие дни не предлагаем).
    const availableDates: string[] = [];
    for (let day = 1; day <= monthEndDate.getDate(); day++) {
      const d = new Date(year, month, day);
      if (d < todayStart) continue;
      if (isDayAvailable(d)) availableDates.push(calendarDateStr(year, month, day));
    }

    // Ближайшая доступная дата в пределах горизонта (может быть в другом месяце).
    let earliestAvailableDate: string | null = null;
    const cursor = new Date(todayStart);
    for (let i = 0; i <= HORIZON_DAYS && !earliestAvailableDate; i++) {
      if (isDayAvailable(cursor)) {
        earliestAvailableDate = calendarDateStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return NextResponse.json({
      year,
      month,
      durationMin,
      availableDates,
      earliestAvailableDate,
      horizonDays: HORIZON_DAYS,
    });
  } catch (err) {
    log.error("api.slots.month", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
