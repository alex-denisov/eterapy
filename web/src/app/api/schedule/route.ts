import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

/** GET /api/schedule?practitionerId=xxx — расписание и заблокированные слоты */
export async function GET(req: NextRequest) {
  const practitionerId = req.nextUrl.searchParams.get("practitionerId");
  if (!practitionerId) return NextResponse.json({ error: "practitionerId обязателен" }, { status: 400 });

  const [rules, blocked] = await Promise.all([
    db.scheduleRule.findMany({ where: { practitionerId, enabled: true }, orderBy: { dayOfWeek: "asc" } }),
    db.blockedSlot.findMany({
      where: { practitionerId, endAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  return NextResponse.json({ rules, blocked });
}

/** PUT /api/schedule — обновить стандартное расписание практика */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (session.user?.role !== "PRACTITIONER") return NextResponse.json({ error: "Только для практиков" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({ where: { userId: session.user.id } });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const { rules } = await req.json() as {
    rules: Array<{ dayOfWeek: number; startHour: number; startMinute: number; endHour: number; endMinute: number; enabled: boolean }>;
  };

  // Upsert each rule
  for (const rule of rules) {
    await db.scheduleRule.upsert({
      where: { practitionerId_dayOfWeek: { practitionerId: practitioner.id, dayOfWeek: rule.dayOfWeek } },
      create: { practitionerId: practitioner.id, ...rule },
      update: { startHour: rule.startHour, startMinute: rule.startMinute, endHour: rule.endHour, endMinute: rule.endMinute, enabled: rule.enabled },
    });
  }

  return NextResponse.json({ ok: true });
}

/** POST /api/schedule/block — заблокировать временной интервал */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (session.user?.role !== "PRACTITIONER") return NextResponse.json({ error: "Только для практиков" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({ where: { userId: session.user.id } });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const { startAt, endAt } = await req.json();
  if (!startAt || !endAt) return NextResponse.json({ error: "startAt и endAt обязательны" }, { status: 400 });

  const block = await db.blockedSlot.create({
    data: { practitionerId: practitioner.id, startAt: new Date(startAt), endAt: new Date(endAt) },
  });

  return NextResponse.json({ ok: true, block });
}

/** DELETE /api/schedule — разблокировать слот */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { blockId } = await req.json();
  const practitioner = await db.practitioner.findUnique({ where: { userId: session.user.id } });

  const block = await db.blockedSlot.findFirst({ where: { id: blockId, practitionerId: practitioner?.id } });
  if (!block) return NextResponse.json({ error: "Блок не найден" }, { status: 404 });

  await db.blockedSlot.delete({ where: { id: blockId } });
  return NextResponse.json({ ok: true });
}
