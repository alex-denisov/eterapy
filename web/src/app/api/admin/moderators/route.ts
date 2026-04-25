import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import bcrypt from "bcryptjs";
import { sendPasswordResetEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

function requireSuperAdmin(role?: string) {
  return role === "SUPERADMIN";
}

// Все доступные полномочия модератора
export const ALL_PERMISSIONS = [
  "clients.view", "clients.create", "clients.edit", "clients.block",
  "clients.delete", "clients.reset_password", "clients.set_password",
  "clients.view_sessions", "clients.view_events",
  "practitioners.view", "practitioners.create", "practitioners.edit",
  "practitioners.block", "practitioners.reset_password", "practitioners.set_password",
  "practitioners.set_rates", "practitioners.set_schedule",
  "practitioners.view_earnings", "practitioners.payout",
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

export async function GET() {
  const session = await auth();
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
  if (!requireSuperAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const adminId = session!.user!.id!;
  const { moderatorId, permissions, name, blockedAt, password, sendResetLink } = await req.json();
  if (!moderatorId) return NextResponse.json({ error: "moderatorId обязателен" }, { status: 400 });

  const moderator = await db.user.findUnique({
    where: { id: moderatorId },
    select: { id: true, role: true, email: true, name: true },
  });
  if (!moderator || moderator.role !== "ADMIN") {
    return NextResponse.json({ error: "Модератор не найден" }, { status: 404 });
  }

  if (typeof name === "string" && name.trim().length > 0) {
    await db.user.update({ where: { id: moderatorId }, data: { name: name.trim() } });
    await logAudit(adminId, "PROFILE_UPDATE", moderatorId, "moderator name");
  }
  if (blockedAt !== undefined) {
    await db.user.update({
      where: { id: moderatorId },
      data: { blockedAt: blockedAt ? new Date() : null },
    });
    await logAudit(adminId, blockedAt ? "ACCOUNT_BLOCK" : "ACCOUNT_UNBLOCK", moderatorId, "moderator");
  }
  if (typeof password === "string" && password.length >= 8) {
    const hashed = await bcrypt.hash(password, 10);
    await db.user.update({
      where: { id: moderatorId },
      data: { password: hashed, resetToken: null, resetExpires: null },
    });
    await logAudit(adminId, "PASSWORD_SET", moderatorId, "moderator");
  } else if (password !== undefined) {
    return NextResponse.json({ error: "Пароль должен быть не менее 8 символов" }, { status: 400 });
  }

  if (sendResetLink === true) {
    const token = randomBytes(24).toString("hex");
    await db.user.update({
      where: { id: moderatorId },
      data: { resetToken: token, resetExpires: new Date(Date.now() + 3_600_000) },
    });
    sendPasswordResetEmail(moderator.email, moderator.name, token).catch((e) =>
      console.error("[moderators] reset-email failed:", e),
    );
    await logAudit(adminId, "PASSWORD_RESET", moderatorId, "moderator (reset-link sent)");
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
  if (!requireSuperAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { moderatorId } = await req.json();
  await db.moderatorPermission.deleteMany({ where: { moderatorId } });
  await db.user.delete({ where: { id: moderatorId } });
  return NextResponse.json({ ok: true });
}
