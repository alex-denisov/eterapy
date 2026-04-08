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
    select: { birthDate: true, birthTime: true, birthPlace: true, maritalStatus: true, occupation: true, aiGoals: true },
  });

  return NextResponse.json({ profile: user });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { birthDate, birthTime, birthPlace, maritalStatus, occupation, aiGoals } = await req.json();

  // birthDate приходит как "ДД.ММ.ГГГГ". Конвертируем в UTC midnight.
  let utcBirthDate: Date | null = null;
  if (birthDate) {
    const [day, month, year] = birthDate.split(".").map(Number);
    utcBirthDate = new Date(Date.UTC(year, month - 1, day));
  }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      ...(birthDate !== undefined ? { birthDate: utcBirthDate } : {}),
      ...(birthTime !== undefined ? { birthTime } : {}),
      ...(birthPlace !== undefined ? { birthPlace } : {}),
      ...(maritalStatus !== undefined ? { maritalStatus } : {}),
      ...(occupation !== undefined ? { occupation } : {}),
      ...(aiGoals !== undefined ? { aiGoals } : {}),
    },
  });

  await logAudit(session.user.id, "PROFILE_UPDATE", undefined, "Расширенный профиль");
  return NextResponse.json({ ok: true });
}
