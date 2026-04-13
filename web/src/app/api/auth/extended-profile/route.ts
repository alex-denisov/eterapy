/**
 * GET  /api/auth/extended-profile — получить расширенный профиль
 * PATCH /api/auth/extended-profile — обновить расширенный профиль
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { birthDate: true, birthTime: true, birthPlace: true, timezone: true, maritalStatus: true, occupation: true, aiGoals: true },
  });

  // Serialize birthDate as YYYY-MM-DD string instead of full ISO
  const profile = user
    ? {
        ...user,
        birthDate: user.birthDate
          ? user.birthDate.toISOString().split("T")[0]
          : null,
      }
    : null;

  return NextResponse.json({ profile });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { birthDate, birthTime, birthPlace, timezone, maritalStatus, occupation, aiGoals } = await req.json();

  // birthDate приходит как "ДД.ММ.ГГГГ". Конвертируем в Date, сохраняя как UTC-дату.
  // Используем 23:59:59 UTC (конец дня) чтобы ни один часовой пояс не сдвинул дату назад.
  let utcBirthDate: Date | null = null;
  if (birthDate) {
    const [day, month, year] = birthDate.split(".").map(Number);
    utcBirthDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
  }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      ...(birthDate !== undefined ? { birthDate: utcBirthDate } : {}),
      ...(birthTime !== undefined ? { birthTime } : {}),
      ...(birthPlace !== undefined ? { birthPlace } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
      ...(maritalStatus !== undefined ? { maritalStatus } : {}),
      ...(occupation !== undefined ? { occupation } : {}),
      ...(aiGoals !== undefined ? { aiGoals } : {}),
    },
  });

  await logAudit(session.user.id, "PROFILE_UPDATE", undefined, "Расширенный профиль");
  return NextResponse.json({ ok: true });
}
