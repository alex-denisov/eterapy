/**
 * GET  /api/notifications/preferences  — получить настройки пользователя
 * PATCH /api/notifications/preferences — обновить одну настройку
 * PUT  /api/notifications/preferences  — заменить все настройки
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { ALL_EVENTS } from "@/lib/notification-events";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const prefs = await db.notificationPreference.findMany({ where: { userId } });

  // Merge with defaults — return full matrix.
  // Default enabled: EMAIL, WEB (in-cabinet bell).  TELEGRAM opt-in.
  const result = ALL_EVENTS.flatMap(({ event }) =>
    (["EMAIL", "TELEGRAM", "WEB"] as const).map(channel => {
      const pref = prefs.find(p => p.event === event && p.channel === channel);
      return {
        event,
        channel,
        enabled: pref ? pref.enabled : channel !== "TELEGRAM",
        remindBeforeHours: pref?.remindBeforeHours ?? null,
      };
    })
  );

  return NextResponse.json({ prefs: result });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { event, channel, enabled, remindBeforeHours } = await req.json();

  await db.notificationPreference.upsert({
    where: { userId_event_channel: { userId, event, channel } },
    create: { userId, event, channel, enabled: enabled ?? true, remindBeforeHours: remindBeforeHours ?? null },
    update: { enabled: enabled ?? true, remindBeforeHours: remindBeforeHours ?? null },
  });

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { prefs }: { prefs: Array<{ event: string; channel: string; enabled: boolean; remindBeforeHours?: number | null }> } = await req.json();

  await db.$transaction(
    prefs.map(p =>
      db.notificationPreference.upsert({
        where: { userId_event_channel: { userId, event: p.event as never, channel: p.channel as never } },
        create: { userId, event: p.event as never, channel: p.channel as never, enabled: p.enabled, remindBeforeHours: p.remindBeforeHours ?? null },
        update: { enabled: p.enabled, remindBeforeHours: p.remindBeforeHours ?? null },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
