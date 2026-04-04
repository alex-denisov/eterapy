import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

/** GET /api/rates?practitionerId=xxx — тарифная сетка */
export async function GET(req: NextRequest) {
  const practitionerId = req.nextUrl.searchParams.get("practitionerId");
  if (!practitionerId) return NextResponse.json({ error: "practitionerId обязателен" }, { status: 400 });

  const rates = await db.priceRate.findMany({
    where: { practitionerId },
    orderBy: { durationMin: "asc" },
  });

  return NextResponse.json({ rates });
}

/** PATCH /api/rates — обновить тарифы практика (сам практик или ADMIN/SUPERADMIN) */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // @ts-expect-error custom
  const role = session.user?.role;
  const { practitionerId, rates } = await req.json() as {
    practitionerId: string;
    rates: Array<{ durationMin: number; priceRub: number; enabled: boolean }>;
  };

  if (!practitionerId || !rates) return NextResponse.json({ error: "Данные неполны" }, { status: 400 });

  // Проверка доступа
  if (role === "PRACTITIONER") {
    const prac = await db.practitioner.findUnique({ where: { userId: session.user.id } });
    if (!prac || prac.id !== practitionerId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  } else if (!["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const VALID_DURATIONS = [15, 30, 45, 60, 90, 120];

  for (const rate of rates) {
    if (!VALID_DURATIONS.includes(rate.durationMin)) continue;
    await db.priceRate.upsert({
      where: { practitionerId_durationMin: { practitionerId, durationMin: rate.durationMin } },
      create: { practitionerId, durationMin: rate.durationMin, priceRub: rate.priceRub, enabled: rate.enabled },
      update: { priceRub: rate.priceRub, enabled: rate.enabled },
    });
  }

  return NextResponse.json({ ok: true });
}
