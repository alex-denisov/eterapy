/**
 * GET   /api/notifications        — latest WEB-channel notifications for current user
 * PATCH /api/notifications        — { id? } mark one read; no id = mark all read
 * DELETE /api/notifications       — { id? } delete one; no id = clear all
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

const MAX_ROWS = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  return NextResponse.json({
    notifications: rows.map(r => ({
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
