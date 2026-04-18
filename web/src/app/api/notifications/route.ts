/**
 * GET   /api/notifications        — latest WEB-channel notifications for current user,
 *                                    filtered by role permission × user Web preference.
 * PATCH /api/notifications        — { id? } mark one read; no id = mark all read
 * DELETE /api/notifications       — { id? } delete one; no id = clear all
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { ALL_EVENTS, type NotifEvent, type UserRole } from "@/lib/notification-events";

const MAX_ROWS = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user.role ?? "CLIENT") as UserRole;

  // Events the viewer's role may ever receive.
  const allowedEvents = new Set<NotifEvent>(
    ALL_EVENTS.filter(e => e.roles.includes(role)).map(e => e.event)
  );

  // Events the user has explicitly disabled for WEB channel. WEB default is on,
  // so only rows in NotificationPreference with enabled=false count as "disabled".
  const disabledPrefs = await db.notificationPreference.findMany({
    where: { userId: session.user.id, channel: "WEB", enabled: false },
    select: { event: true },
  });
  const disabledEvents = new Set<NotifEvent>(disabledPrefs.map(p => p.event as NotifEvent));

  const rows = await db.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS * 2, // fetch a bit extra so post-filter list still has a reasonable size
  });

  const visible = rows
    .filter(r => allowedEvents.has(r.event as NotifEvent))
    .filter(r => !disabledEvents.has(r.event as NotifEvent))
    .slice(0, MAX_ROWS);

  return NextResponse.json({
    notifications: visible.map(r => ({
      id: r.id,
      event: r.event,
      title: r.title,
      body: r.body,
      href: r.href,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id: string | undefined = body?.id;

  if (id) {
    await db.notification.updateMany({
      where: { id, userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
  } else {
    await db.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id: string | undefined = body?.id;

  if (id) {
    await db.notification.deleteMany({ where: { id, userId: session.user.id } });
  } else {
    await db.notification.deleteMany({ where: { userId: session.user.id } });
  }

  return NextResponse.json({ ok: true });
}
