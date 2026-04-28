/**
 * GET  /api/notifications/preferences  — получить настройки пользователя
 * PATCH /api/notifications/preferences — обновить одну настройку
 * PUT  /api/notifications/preferences  — заменить все настройки
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { ALL_EVENTS } from "@/lib/notification-events";
import { getSetting, setSetting } from "@/lib/platform-settings";

const channels = ["EMAIL", "TELEGRAM", "WEB"] as const;
const events = ALL_EVENTS.map(({ event }) => event) as [string, ...string[]];
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const quietHoursSchema = z.object({
  enabled: z.boolean(),
  from: timeSchema,
  to: timeSchema,
  timezone: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_+\-/]+$/),
});
const preferenceSchema = z.object({
  event: z.enum(events),
  channel: z.enum(channels),
  enabled: z.boolean(),
  remindBeforeHours: z.union([
    z.number().int().nonnegative(),
    z.array(z.number().int().nonnegative()).max(4),
    z.null(),
  ]).optional(),
});
const putSchema = z.object({
  prefs: z.array(preferenceSchema).max(200),
  quietHours: quietHoursSchema.optional(),
});
const patchSchema = preferenceSchema.partial({ enabled: true, remindBeforeHours: true }).required({
  event: true,
  channel: true,
});

type QuietHours = z.infer<typeof quietHoursSchema>;

function quietHoursKey(userId: string) {
  return `notification.quiet_hours.${userId}`;
}

function defaultQuietHours(timezone?: string | null): QuietHours {
  return {
    enabled: false,
    from: "22:00",
    to: "09:00",
    timezone: timezone || "Europe/Moscow",
  };
}

function parseQuietHours(value: string, timezone?: string | null): QuietHours {
  if (!value) return defaultQuietHours(timezone);
  try {
    const parsed = quietHoursSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : defaultQuietHours(timezone);
  } catch {
    return defaultQuietHours(timezone);
  }
}

function normalizeReminder(value: unknown): number | null {
  if (Array.isArray(value)) return typeof value[0] === "number" ? value[0] : null;
  return typeof value === "number" ? value : null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const [prefs, user, quietHoursValue] = await Promise.all([
    db.notificationPreference.findMany({ where: { userId } }),
    db.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    getSetting(quietHoursKey(userId)),
  ]);

  // Merge with defaults — return full matrix.
  // Default enabled: EMAIL, WEB (in-cabinet bell).  TELEGRAM opt-in.
  const result = ALL_EVENTS.flatMap(({ event, category }) =>
    channels.map(channel => {
      const pref = prefs.find(p => p.event === event && p.channel === channel);
      return {
        event,
        category,
        channel,
        enabled: pref ? pref.enabled : channel !== "TELEGRAM",
        remindBeforeHours: typeof pref?.remindBeforeHours === "number" ? [pref.remindBeforeHours] : [],
      };
    })
  );

  return NextResponse.json({
    prefs: result,
    quietHours: parseQuietHours(quietHoursValue, user?.timezone),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preferences payload" }, { status: 400 });
  const { event, channel, enabled, remindBeforeHours } = parsed.data;
  const nextEnabled = enabled ?? true;
  const nextReminder = normalizeReminder(remindBeforeHours);

  await db.notificationPreference.upsert({
    where: { userId_event_channel: { userId, event, channel } },
    create: { userId, event: event as never, channel, enabled: nextEnabled, remindBeforeHours: nextReminder },
    update: { enabled: nextEnabled, remindBeforeHours: nextReminder },
  });

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preferences payload" }, { status: 400 });
  const { prefs, quietHours } = parsed.data;

  const writes: Array<ReturnType<typeof db.notificationPreference.upsert>> = prefs.map(p =>
      db.notificationPreference.upsert({
        where: { userId_event_channel: { userId, event: p.event as never, channel: p.channel as never } },
        create: {
          userId,
          event: p.event as never,
          channel: p.channel as never,
          enabled: p.enabled,
          remindBeforeHours: normalizeReminder(p.remindBeforeHours),
        },
        update: { enabled: p.enabled, remindBeforeHours: normalizeReminder(p.remindBeforeHours) },
      })
  );

  await db.$transaction(writes);
  if (quietHours) await setSetting(quietHoursKey(userId), JSON.stringify(quietHours), userId);

  return NextResponse.json({ ok: true });
}
