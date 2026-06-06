import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserActivePlan } from "@/lib/entitlements";
import { trackServerEvent } from "@/lib/analytics";
import { bookingPriorityForPlan } from "@/lib/priority-booking";
import { log } from "@/lib/logger";

function formatWaitlistEntry(entry: {
  id: string;
  status: string;
  priority: number;
  startAt: Date;
  endAt: Date;
  slotId?: string | null;
}) {
  return {
    id: entry.id,
    status: entry.status,
    priority: entry.priority,
    slotId: entry.slotId ?? null,
    startAt: entry.startAt.toISOString(),
    endAt: entry.endAt.toISOString(),
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (session.user.role !== "CLIENT") {
    return NextResponse.json({ error: "Лист ожидания доступен только клиентам" }, { status: 403 });
  }

  try {
    const { practitionerId, slotId, slotStartAt, slotEndAt } = await req.json() as {
      practitionerId?: unknown;
      slotId?: unknown;
      slotStartAt?: unknown;
      slotEndAt?: unknown;
    };
    if (typeof practitionerId !== "string" || !practitionerId.trim()) {
      return NextResponse.json({ error: "practitionerId обязателен" }, { status: 400 });
    }

    const practitioner = await db.practitioner.findUnique({ where: { id: practitionerId } });
    if (!practitioner || practitioner.status !== "ACTIVE" || !practitioner.verified) {
      return NextResponse.json({ error: "Практик временно недоступен" }, { status: 409 });
    }

    let resolvedSlotId: string | null = null;
    let startAt: Date;
    let endAt: Date;

    if (typeof slotId === "string" && slotId.trim()) {
      const slot = await db.timeSlot.findUnique({ where: { id: slotId } });
      if (!slot || slot.practitionerId !== practitionerId) {
        return NextResponse.json({ error: "Слот не найден" }, { status: 404 });
      }
      resolvedSlotId = slot.id;
      startAt = slot.startAt;
      endAt = slot.endAt;
    } else if (typeof slotStartAt === "string" && typeof slotEndAt === "string") {
      startAt = new Date(slotStartAt);
      endAt = new Date(slotEndAt);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || startAt >= endAt) {
        return NextResponse.json({ error: "Некорректное время слота" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Укажите слот или интервал времени" }, { status: 400 });
    }

    const activePlan = await getUserActivePlan(session.user.id).catch(() => null);
    const priority = bookingPriorityForPlan(activePlan);
    const existing = await db.bookingWaitlistEntry.findFirst({
      where: {
        clientId: session.user.id,
        practitionerId,
        startAt,
        endAt,
        status: "ACTIVE",
      },
    });
    if (existing) {
      return NextResponse.json({ ok: true, waitlistEntry: formatWaitlistEntry(existing) });
    }
    const activeCount = await db.bookingWaitlistEntry.count({
      where: { clientId: session.user.id, status: "ACTIVE" },
    });
    if (activeCount >= 20) {
      return NextResponse.json({ error: "Слишком много активных заявок в листе ожидания" }, { status: 429 });
    }

    const entry = await db.bookingWaitlistEntry.create({
      data: {
        clientId: session.user.id,
        practitionerId,
        slotId: resolvedSlotId,
        startAt,
        endAt,
        priority,
        planKey: activePlan?.key ?? null,
      },
    });

    trackServerEvent(db, {
      event: "waitlist_joined",
      userId: session.user.id,
      surface: "booking",
      properties: {
        practitioner_id: practitionerId,
        slot_id: resolvedSlotId ?? "",
        priority: String(priority),
        plan: activePlan?.key ?? "free",
      },
    });

    return NextResponse.json({ ok: true, waitlistEntry: formatWaitlistEntry(entry) });
  } catch (err) {
    log.error("api.waitlist.post", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const { waitlistId } = await req.json() as { waitlistId?: unknown };
    if (typeof waitlistId !== "string" || !waitlistId.trim()) {
      return NextResponse.json({ error: "waitlistId обязателен" }, { status: 400 });
    }

    const result = await db.bookingWaitlistEntry.updateMany({
      where: { id: waitlistId, clientId: session.user.id, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    if (result.count === 0) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("api.waitlist.delete", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
