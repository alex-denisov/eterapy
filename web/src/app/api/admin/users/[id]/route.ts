import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email";
import { getUserPermissions, type Permission } from "@/lib/moderator-permissions";
import { getClarityCreditBalance, recordClarityCreditEntry } from "@/lib/clarity-credits";
import { getSubscriptionPlan } from "@/lib/entitlements";

function isAdminOrSuper(role?: string) {
  return role === "ADMIN" || role === "SUPERADMIN";
}

// Per-action permission gate. SUPERADMIN bypasses all checks (permissions list
// already contains every permission for SUPERADMIN via getUserPermissions).
const ACTION_PERMISSION: Record<string, Permission | "SUPERADMIN_ONLY"> = {
  update_name:      "clients.edit",
  update_profile:   "clients.edit",
  set_password:     "clients.set_password",
  reset_password:   "clients.reset_password",
  block:            "clients.block",
  unblock:          "clients.block",
  update_clarity_credits: "SUPERADMIN_ONLY",
  set_subscription: "SUPERADMIN_ONLY",
  soft_delete:      "clients.delete",
  restore:          "clients.delete",
};

type Params = { params: Promise<{ id: string }> };

// GET — детали пользователя
export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!isAdminOrSuper(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, emailVerified: true,
      avatarUrl: true, deletedAt: true, blockedAt: true,
      createdAt: true, updatedAt: true,
      birthDate: true, birthTime: true, birthPlace: true, timezone: true,
      telegramUsername: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  return NextResponse.json({ user });
}

// PATCH — обновить данные пользователя
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
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

  // Enforce per-action permission for CLIENT targets. SUPERADMIN has all perms via getUserPermissions.
  const gate = ACTION_PERMISSION[action as string];
  if (gate) {
    if (gate === "SUPERADMIN_ONLY") {
      if (adminRole !== "SUPERADMIN") {
        return NextResponse.json({ error: `Действие «${action}» доступно только суперадмину` }, { status: 403 });
      }
    } else {
      const perms = await getUserPermissions(adminId, adminRole!);
      if (!perms.includes(gate)) {
        return NextResponse.json({ error: `Нет полномочия ${gate}` }, { status: 403 });
      }
    }
  }

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
    case "update_profile": {
      const { email, birthDate, birthTime, birthPlace, timezone, telegramUsername } = body;
      const data: Record<string, unknown> = {};

      if (typeof email === "string" && email.trim()) {
        const trimmedEmail = email.trim().toLowerCase();
        if (trimmedEmail !== targetUser.email) {
          const existing = await db.user.findUnique({ where: { email: trimmedEmail }, select: { id: true } });
          if (existing && existing.id !== id) {
            return NextResponse.json({ error: "Email уже используется" }, { status: 409 });
          }
          data.email = trimmedEmail;
        }
      }
      if (birthDate !== undefined) {
        data.birthDate = birthDate ? new Date(birthDate) : null;
      }
      if (birthTime !== undefined) {
        data.birthTime = typeof birthTime === "string" && birthTime.trim() ? birthTime.trim() : null;
      }
      if (birthPlace !== undefined) {
        data.birthPlace = typeof birthPlace === "string" && birthPlace.trim() ? birthPlace.trim() : null;
      }
      if (timezone !== undefined) {
        data.timezone = typeof timezone === "string" && timezone.trim() ? timezone.trim() : null;
      }
      if (telegramUsername !== undefined) {
        const raw = typeof telegramUsername === "string" ? telegramUsername.trim().replace(/^@/, "") : "";
        data.telegramUsername = raw || null;
      }

      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
      }

      await db.user.update({ where: { id }, data });
      await logAudit(adminId, "PROFILE_UPDATE", id, Object.keys(data).join(","));
      return NextResponse.json({ ok: true });
    }
    case "update_clarity_credits": {
      // Clarity credits are a client-only currency; gate by user class so the
      // option stays inert for practitioners/staff (T4).
      if (targetUser.role !== "CLIENT") {
        return NextResponse.json({ error: "Баллы доступны только клиентам" }, { status: 400 });
      }
      const target = Number(body.clarityCredits);
      if (!Number.isInteger(target) || target < 0) {
        return NextResponse.json({ error: "Некорректное количество баллов" }, { status: 400 });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const current = await getClarityCreditBalance(id);
      const delta = target - current;
      if (delta !== 0) {
        await db.$transaction((tx) =>
          recordClarityCreditEntry(tx, {
            userId: id,
            amount: delta,
            type: "adjustment",
            source: "admin",
            metadata: { reason: reason || "admin manual adjustment", by: adminId },
          }),
        );
      }
      await logAudit(adminId, "PROFILE_UPDATE", id, `clarity_credits=${target}${reason ? ` (${reason})` : ""}`);
      return NextResponse.json({ ok: true, clarityCredits: target });
    }
    case "set_subscription": {
      if (!["CLIENT", "PRACTITIONER"].includes(targetUser.role)) {
        return NextResponse.json({ error: "Подписку можно назначить только клиенту или практику" }, { status: 400 });
      }
      const planKey = typeof body.planKey === "string" && body.planKey.trim() ? body.planKey.trim() : null;
      if (planKey && !getSubscriptionPlan(planKey)) {
        return NextResponse.json({ error: "Неизвестный тариф подписки" }, { status: 400 });
      }
      const clientPlans = ["plus", "premium"];
      const practitionerPlans = ["practitioner_pro", "practitioner_pro_plus"];
      if (planKey && targetUser.role === "CLIENT" && !clientPlans.includes(planKey)) {
        return NextResponse.json({ error: "Этот тариф не относится к клиентским подпискам" }, { status: 400 });
      }
      if (planKey && targetUser.role === "PRACTITIONER" && !practitionerPlans.includes(planKey)) {
        return NextResponse.json({ error: "Этот тариф не относится к подпискам практиков" }, { status: 400 });
      }
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await db.$transaction(async (tx) => {
        await tx.userSubscription.updateMany({
          where: {
            userId: id,
            status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
            OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
          },
          data: {
            status: "CANCELLED",
            cancelAtPeriodEnd: false,
            cancelledAt: now,
            currentPeriodEnd: now,
          },
        });
        if (planKey) {
          await tx.userSubscription.create({
            data: {
              userId: id,
              planKey,
              status: "ACTIVE",
              provider: "admin",
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              metadata: { assignedBy: adminId, reason: "manual_admin_assignment" },
            },
          });
        }
      });
      await logAudit(adminId, "PROFILE_UPDATE", id, `subscription=${planKey ?? "none"}`);
      return NextResponse.json({ ok: true });
    }
    case "soft_delete": {
      // Sets deletedAt = now. /api/cron/cleanup purges users after 10 days.
      if (targetUser.deletedAt) return NextResponse.json({ error: "Уже помечен на удаление" }, { status: 400 });
      await db.user.update({ where: { id }, data: { deletedAt: new Date() } });
      await logAudit(adminId, "ACCOUNT_DELETE", id, typeof comment === "string" ? comment : "");
      return NextResponse.json({ ok: true });
    }
    case "restore": {
      if (!targetUser.deletedAt) return NextResponse.json({ error: "Не был удалён" }, { status: 400 });
      await db.user.update({ where: { id }, data: { deletedAt: null } });
      await logAudit(adminId, "PROFILE_UPDATE", id, "restore");
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: `Неизвестное действие: ${action}` }, { status: 400 });
  }
}
