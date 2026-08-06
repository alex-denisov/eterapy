/**
 * GET  /api/notifications/preferences  — получить настройки пользователя
 * PATCH /api/notifications/preferences — обновить одну настройку
 * PUT  /api/notifications/preferences  — заменить все настройки
 */
import { NextRequest, NextResponse } from "next/server";
import { NotificationChannel, NotificationEvent } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { ALL_EVENTS, getEventsForRole, type UserRole } from "@/lib/notification-events";
import {
  getUserQuietHours,
  quietHoursSchema,
  setUserQuietHours,
} from "@/lib/notification-preference-settings";

const channels = ["EMAIL", "TELEGRAM", "WEB"] as const;
const events = ALL_EVENTS.map(({ event }) => event) as [string, ...string[]];
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
  marketingConsent: z.boolean().optional(),
  // B681: показ блока «карта дня» на первом экране. Живёт здесь, а не в
  // матрице событий, потому что это не канал доставки — это видимость блока.
  // Владелец потребовал, чтобы вернуть его можно было именно на этом экране.
  tarotDayVisible: z.boolean().optional(),
});
const patchSchema = preferenceSchema.partial({ enabled: true, remindBeforeHours: true }).required({
  event: true,
  channel: true,
});

function normalizeReminder(value: unknown): number | null {
  if (Array.isArray(value)) return typeof value[0] === "number" ? value[0] : null;
  return typeof value === "number" ? value : null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const availableEvents = getEventsForRole((session.user.role ?? "CLIENT") as UserRole);
  const [prefs, user] = await Promise.all([
    db.notificationPreference.findMany({ where: { userId } }),
    db.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        marketingConsentAt: true,
        marketingConsentSource: true,
        marketingOptOutAt: true,
        tarotDayHidden: true,
      },
    }),
  ]);

  // Merge with defaults — return full matrix.
  // Default enabled: EMAIL, WEB (in-cabinet bell).  TELEGRAM opt-in.
  const result = availableEvents.flatMap(({ event, category, label, description }) =>
    channels.map(channel => {
      const pref = prefs.find(p => p.event === event && p.channel === channel);
      return {
        event,
        category,
        label,
        description,
        channel,
        enabled: pref ? pref.enabled : channel !== "TELEGRAM",
        remindBeforeHours: typeof pref?.remindBeforeHours === "number" ? [pref.remindBeforeHours] : [],
      };
    })
  );

  return NextResponse.json({
    prefs: result,
    quietHours: await getUserQuietHours(userId, user?.timezone),
    marketingConsent: Boolean(user?.marketingConsentAt && !user.marketingOptOutAt),
    marketingConsentSource: user?.marketingConsentSource ?? null,
    tarotDayVisible: !user?.tarotDayHidden,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preferences payload" }, { status: 400 });
  const { event, channel, enabled, remindBeforeHours } = parsed.data;
  const allowed = getEventsForRole((session.user.role ?? "CLIENT") as UserRole).some((item) => item.event === event);
  if (!allowed) return NextResponse.json({ error: "Notification event is not available for this account" }, { status: 403 });
  const typedEvent = event as NotificationEvent;
  const typedChannel = channel as NotificationChannel;
  const nextEnabled = enabled ?? true;
  const nextReminder = normalizeReminder(remindBeforeHours);

  await db.notificationPreference.upsert({
    where: { userId_event_channel: { userId, event: typedEvent, channel: typedChannel } },
    create: { userId, event: typedEvent, channel: typedChannel, enabled: nextEnabled, remindBeforeHours: nextReminder },
    update: { enabled: nextEnabled, remindBeforeHours: nextReminder },
  });
  // B464 round-4 #7: «Настроить уведомления» retired from the goal set — the
  // referral goal replaced it (see lib/missions.ts).

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preferences payload" }, { status: 400 });
  const { prefs, quietHours, marketingConsent, tarotDayVisible } = parsed.data;
  const allowedEvents = new Set<string>(getEventsForRole((session.user.role ?? "CLIENT") as UserRole).map((item) => item.event));
  if (prefs.some((pref) => !allowedEvents.has(pref.event))) {
    return NextResponse.json({ error: "Notification event is not available for this account" }, { status: 403 });
  }

  const writes: Array<ReturnType<typeof db.notificationPreference.upsert>> = prefs.map(p =>
      db.notificationPreference.upsert({
        where: { userId_event_channel: { userId, event: p.event as NotificationEvent, channel: p.channel as NotificationChannel } },
        create: {
          userId,
          event: p.event as NotificationEvent,
          channel: p.channel as NotificationChannel,
          enabled: p.enabled,
          remindBeforeHours: normalizeReminder(p.remindBeforeHours),
        },
        update: { enabled: p.enabled, remindBeforeHours: normalizeReminder(p.remindBeforeHours) },
      })
  );

  await db.$transaction(writes);
  if (quietHours) await setUserQuietHours(userId, quietHours);
  if (tarotDayVisible !== undefined) {
    await db.user.update({ where: { id: userId }, data: { tarotDayHidden: !tarotDayVisible } });
  }
  if (marketingConsent !== undefined) {
    await db.user.update({
      where: { id: userId },
      data: marketingConsent
        ? {
            marketingConsentAt: new Date(),
            marketingConsentSource: "cabinet-notification-settings",
            marketingOptOutAt: null,
          }
        : {
            marketingConsentAt: null,
            marketingConsentSource: null,
            marketingOptOutAt: new Date(),
          },
    });
  }

  return NextResponse.json({ ok: true });
}
