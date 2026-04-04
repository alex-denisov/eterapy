import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email";

function isAdminOrSuper(role?: string) {
  return role === "ADMIN" || role === "SUPERADMIN";
}

type Params = { params: Promise<{ id: string }> };

// GET — детали пользователя
export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  // @ts-expect-error custom
  if (!isAdminOrSuper(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, emailVerified: true,
      avatarUrl: true, deletedAt: true, blockedAt: true, freeToolsLimit: true,
      createdAt: true, updatedAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  return NextResponse.json({ user });
}

// PATCH — обновить данные пользователя
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  // @ts-expect-error custom
  const adminRole = session?.user?.role;
  if (!isAdminOrSuper(adminRole)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { action, name, newPassword, comment } = body;

  const targetUser = await db.user.findUnique({ where: { id } });
  if (!targetUser) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  // Защита: только SUPERADMIN может менять ADMINов и SUPERADMIN
  if (["ADMIN", "SUPERADMIN"].includes(targetUser.role) && adminRole !== "SUPERADMIN") {
    return NextResponse.json({ error: "Только суперадмин может изменять администраторов" }, { status: 403 });
  }

  const adminId = session!.user!.id!;

  switch (action) {
    case "update_name": {
      if (!name?.trim()) return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });
      await db.user.update({ where: { id }, data: { name: name.trim() } });
      await logAudit(adminId, "PROFILE_UPDATE", id, String(name));
      return NextResponse.json({ ok: true });
    }
    case "set_password": {
      if (!newPassword || newPassword.length < 8) return NextResponse.json({ error: "Минимум 8 символов" }, { status: 400 });
      const hashed = await bcrypt.hash(newPassword, 10);
      await db.user.update({ where: { id }, data: { password: hashed } });
      await logAudit(adminId, "PASSWORD_SET", id);
      return NextResponse.json({ ok: true });
    }
    case "reset_password": {
      const token = crypto.randomUUID().replace(/-/g, "");
      await db.user.update({
        where: { id },
        data: { resetToken: token, resetExpires: new Date(Date.now() + 3_600_000) },
      });
      await sendPasswordResetEmail(targetUser.email, targetUser.name, token);
      await logAudit(adminId, "PASSWORD_RESET", id);
      return NextResponse.json({ ok: true });
    }
    case "block": {
      await db.user.update({ where: { id }, data: { blockedAt: new Date() } });
      await logAudit(adminId, "ACCOUNT_BLOCK", id, String(comment));
      return NextResponse.json({ ok: true });
    }
    case "unblock": {
      await db.user.update({ where: { id }, data: { blockedAt: null } });
      await logAudit(adminId, "ACCOUNT_UNBLOCK", id);
      return NextResponse.json({ ok: true });
    }
    case "set_free_limit": {
      const limit = body.limit === "unlimited" ? 0 : Number(body.limit);
      await db.user.update({ where: { id }, data: { freeToolsLimit: limit } });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: `Неизвестное действие: ${action}` }, { status: 400 });
  }
}
