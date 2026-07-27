import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";
import { getUserPermissions, type Permission } from "@/lib/moderator-permissions";
import { getClarityCreditBalance, recordClarityCreditEntry } from "@/lib/clarity-credits";
import { getSubscriptionPlan } from "@/lib/entitlements";
import { log } from "@/lib/logger";
import { unbindTelegramFromUser } from "@/lib/telegram-binding";

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
  // B571: признак решает, настоящими или тестовыми деньгами платит человек.
  // Это про деньги, поэтому только суперадмин.
  set_test_payments: "SUPERADMIN_ONLY",
  soft_delete:      "clients.delete",
  restore:          "clients.delete",
  // B580: два разных по смыслу действия, поэтому и полномочия разные.
  // «Выслать письмо заново» — обычная поддержка: подтверждение по-прежнему даёт
  // сам человек, нажав ссылку. «Подтвердить вручную» — обход доказательства
  // владения ящиком, и потому только суперадмин.
  resend_verification: "clients.edit",
  verify_email:        "SUPERADMIN_ONLY",
  // INC-088: снятие способа входа и адреса доставки — только суперадмин.
  unlink_telegram:     "SUPERADMIN_ONLY",
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
    // B571 — «тестовые платежи»: человек платит по ТЕСТОВЫМ ключам Robokassa,
    // а платформа обрабатывает платёж как настоящий и начисляет купленное.
    // Снятие признака возвращает на боевые ключи со следующего платежа; уже
    // созданные ссылки остаются в своём режиме — он записан на транзакции.
    case "set_test_payments": {
      const enabled = body.enabled === true;
      await db.user.update({ where: { id }, data: { testPaymentsEnabled: enabled } });
      // Действие про деньги — след в аудите обязателен.
      await logAudit(
        adminId,
        "PROFILE_UPDATE",
        id,
        `test_payments=${enabled ? "on" : "off"}`,
      );
      return NextResponse.json({ ok: true, testPaymentsEnabled: enabled });
    }
    // B580 (owner 2026-07-26): человек зарегистрировался с опечаткой в адресе
    // (`mail.ry` вместо `mail.ru`) и не смог подтвердить почту. Сам исправить
    // адрес он не может — поле недоступно в кабинете, — а после правки адреса
    // администратором ему НЕ уходит ничего: письма ушли на несуществующий ящик,
    // а токен из регистрации живёт 24 часа и к этому моменту истёк.
    //
    // Штатный путь — выслать письмо заново: токен перевыпускается, срок
    // отсчитывается заново, подтверждение по-прежнему даёт сам человек.
    case "resend_verification": {
      if (targetUser.emailVerified) {
        return NextResponse.json({ error: "Email уже подтверждён" }, { status: 400 });
      }
      const token = crypto.randomUUID().replace(/-/g, "");
      await db.user.update({
        where: { id },
        data: {
          verificationToken: token,
          verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      try {
        await sendVerificationEmail(targetUser.email, targetUser.name, token);
      } catch (err) {
        // Токен уже перевыпущен, но письмо не ушло — молчать нельзя: админ
        // решит, что человек его получил, и будет ждать.
        log.error("admin.resend_verification.send_failed", { userId: id, err });
        return NextResponse.json(
          { error: "Токен обновлён, но письмо не отправилось. Проверьте почтовый провайдер." },
          { status: 502 },
        );
      }
      await logAudit(adminId, "PROFILE_UPDATE", id, `resend_verification → ${targetUser.email}`);
      return NextResponse.json({ ok: true, sentTo: targetUser.email });
    }
    // Аварийный путь: признак ставится руками. Это ОБХОД доказательства
    // владения ящиком — платформа больше не знает, что письма доходят. Поэтому
    // только суперадмин и обязательный след в аудите с указанием адреса,
    // который приняли на доверии.
    case "verify_email": {
      if (targetUser.emailVerified) {
        return NextResponse.json({ error: "Email уже подтверждён" }, { status: 400 });
      }
      await db.user.update({
        where: { id },
        data: { emailVerified: true, verificationToken: null, verificationExpires: null },
      });
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      await logAudit(
        adminId,
        "PROFILE_UPDATE",
        id,
        `email_verified=manual (${targetUser.email})${reason ? ` — ${reason}` : ""}`,
      );
      return NextResponse.json({ ok: true });
    }
    // INC-088: перенести Telegram с одного аккаунта на другой можно только
    // отвязав его от прежнего — chat_id уникален. Привязать за человека нельзя
    // (это подтверждается его собственным действием в Telegram), а отвязать —
    // операторское действие: без него владелец упирался в «уже привязан к
    // другому аккаунту» и правил бы базу руками.
    case "unlink_telegram": {
      const result = await unbindTelegramFromUser(id);
      if (!result.unlinked) {
        return NextResponse.json({ error: "Telegram к этому аккаунту не привязан" }, { status: 400 });
      }
      await logAudit(adminId, "LOGIN_METHOD_UNLINK", id, JSON.stringify({ provider: "telegram", subjectId: result.subjectId }));
      return NextResponse.json({ ok: true, subjectId: result.subjectId });
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
          // B580: смена адреса СБРАСЫВАЕТ подтверждение. Иначе у подтверждённого
          // пользователя после правки адреса остаётся признак «почта проверена»
          // на ящик, который никто не проверял, — и восстановление пароля
          // уходит туда же. Подтверждение относится к адресу, а не к аккаунту.
          if (targetUser.emailVerified) {
            data.emailVerified = false;
            data.verificationToken = null;
            data.verificationExpires = null;
          }
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
