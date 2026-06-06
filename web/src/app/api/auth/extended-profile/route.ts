/**
 * GET  /api/auth/extended-profile — получить расширенный профиль
 * PATCH /api/auth/extended-profile — обновить расширенный профиль
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { completeMission } from "@/lib/missions";
import { sanitizeName, sanitizeText } from "@/lib/validation";

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

  const body = await req.json();
  const { birthDate, birthTime, timezone, maritalStatus, aiGoals } = body;
  let { birthPlace, occupation } = body;

  // Sanitize text fields
  if (birthPlace !== undefined) birthPlace = sanitizeName(birthPlace).slice(0, 100);
  if (occupation !== undefined) occupation = sanitizeText(occupation, 100);

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
  void completeMission({
    userId: session.user.id,
    missionKey: "complete_profile",
    metadata: { surface: "extended_profile" },
  }).catch(() => {
    // Mission bookkeeping must not break profile updates.
  });
  return NextResponse.json({ ok: true });
}
