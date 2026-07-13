/**
 * PATCH /api/notifications/timezone — обновить канонический часовой пояс
 * пользователя (поле user.timezone + timezone «Тихих часов»). Правится из
 * «Настройки → Интерфейс»; «Тихие часы» его используют по умолчанию. B466 R9-5.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserQuietHours, setUserQuietHours } from "@/lib/notification-preference-settings";

const schema = z.object({
  timezone: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_+\-/]+$/),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  const { timezone } = parsed.data;

  const current = await getUserQuietHours(userId);
  await Promise.all([
    db.user.update({ where: { id: userId }, data: { timezone } }),
    setUserQuietHours(userId, { ...current, timezone }),
  ]);
  return NextResponse.json({ ok: true, timezone });
}
