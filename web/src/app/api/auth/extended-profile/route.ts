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
    select: { birthDate: true, birthDateSource: true, birthTime: true, birthPlace: true, timezone: true, maritalStatus: true, occupation: true, aiGoals: true },
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
  // Механика 3: the client sends birthDate via formatDateForServer() →
  // "YYYY-MM-DD" (NOT "ДД.ММ.ГГГГ"). The old split(".") produced NaN → an
  // Invalid Date → Prisma threw, failing the WHOLE save ("изменения не
  // сохраняются"). Parse both formats defensively and never persist Invalid Date.
  // Stored at 23:59:59 UTC so no timezone shifts the calendar day backwards.
  let utcBirthDate: Date | null = null;
  if (birthDate) {
    const raw = String(birthDate).trim();
    let y: number | undefined, mo: number | undefined, d: number | undefined;
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dotted = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (iso) { y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
    else if (dotted) { d = +dotted[1]; mo = +dotted[2]; y = +dotted[3]; }
    if (y && mo && d) {
      const parsed = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59));
      if (!Number.isNaN(parsed.getTime())) utcBirthDate = parsed;
    }
    if (!utcBirthDate) {
      return NextResponse.json({ ok: false, error: "Некорректная дата рождения" }, { status: 400 });
    }
  }

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: {
        ...(birthDate !== undefined ? { birthDate: utcBirthDate } : {}),
        ...(birthDate !== undefined ? { birthDateSource: utcBirthDate ? "manual" : null } : {}),
        ...(birthTime !== undefined ? { birthTime } : {}),
        ...(birthPlace !== undefined ? { birthPlace } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(maritalStatus !== undefined ? { maritalStatus } : {}),
        ...(occupation !== undefined ? { occupation } : {}),
        ...(aiGoals !== undefined ? { aiGoals } : {}),
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Не удалось сохранить профиль" }, { status: 500 });
  }

  await logAudit(session.user.id, "PROFILE_UPDATE", undefined, JSON.stringify({
    surface: "extended_profile",
    ...(birthDate !== undefined ? { birthDateSource: utcBirthDate ? "manual" : null } : {}),
  }));
  void completeMission({
    userId: session.user.id,
    missionKey: "complete_profile",
    metadata: { surface: "extended_profile" },
  }).catch(() => {
    // Mission bookkeeping must not break profile updates.
  });
  return NextResponse.json({ ok: true });
}
