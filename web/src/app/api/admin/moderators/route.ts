import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import bcrypt from "bcryptjs";

function requireSuperAdmin(role?: string) {
  return role === "SUPERADMIN";
}

// Все доступные полномочия модератора
export const ALL_PERMISSIONS = [
  "clients.view", "clients.edit", "clients.block", "clients.reset_password",
  "clients.set_password", "clients.view_sessions", "clients.view_events",
  "practitioners.view", "practitioners.create", "practitioners.edit",
  "practitioners.block", "practitioners.reset_password", "practitioners.set_password",
  "practitioners.set_rates", "practitioners.set_schedule", "practitioners.view_earnings",
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

export async function GET() {
  const session = await auth();
  // @ts-expect-error custom
  if (!requireSuperAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const moderators = await db.user.findMany({
    where: { role: "ADMIN" },
    select: {
      id: true, name: true, email: true, createdAt: true, blockedAt: true, avatarUrl: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Загружаем полномочия для каждого
  const allPerms = await db.moderatorPermission.findMany({
    where: { moderatorId: { in: moderators.map(m => m.id) } },
  });

  const result = moderators.map(m => ({
    ...m,
    permissions: allPerms.filter(p => p.moderatorId === m.id).map(p => p.permission),
  }));

  return NextResponse.json({ moderators: result });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  if (!requireSuperAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { name, email, password, permissions } = await req.json();
  if (!name || !email || !password) return NextResponse.json({ error: "name, email, password обязательны" }, { status: 400 });

  const hashed = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: { name, email, password: hashed, role: "ADMIN", emailVerified: true },
  });

  // Назначаем полномочия
  if (permissions?.length) {
    await db.moderatorPermission.createMany({
      data: permissions.map((p: string) => ({ moderatorId: user.id, permission: p, granted: true })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  if (!requireSuperAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { moderatorId, permissions, name, blockedAt } = await req.json();
  if (!moderatorId) return NextResponse.json({ error: "moderatorId обязателен" }, { status: 400 });

  if (name !== undefined) {
    await db.user.update({ where: { id: moderatorId }, data: { name } });
  }
  if (blockedAt !== undefined) {
    await db.user.update({ where: { id: moderatorId }, data: { blockedAt: blockedAt ? new Date() : null } });
  }
  if (permissions !== undefined) {
    // Full replace: delete all, re-create
    await db.moderatorPermission.deleteMany({ where: { moderatorId } });
    if (permissions.length > 0) {
      await db.moderatorPermission.createMany({
        data: permissions.map((p: string) => ({ moderatorId, permission: p, granted: true })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  if (!requireSuperAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { moderatorId } = await req.json();
  await db.moderatorPermission.deleteMany({ where: { moderatorId } });
  await db.user.delete({ where: { id: moderatorId } });
  return NextResponse.json({ ok: true });
}
