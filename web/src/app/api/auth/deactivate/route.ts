import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { ACCOUNT_SOFT_DELETE_GRACE_DAYS, accountPurgeDate } from "@/lib/account-deletion-policy";
import { sendAccountDeletionRequestedEmail } from "@/lib/email";
import { log } from "@/lib/logger";

/**
 * B599 (батч №20). Письмо-подтверждение уходит ПОСЛЕ записи в базу и не может
 * её отменить: отказ почтового провайдера не должен превращать выполненный
 * запрос на удаление в невыполненный. Поэтому `catch` с записью в лог, а не
 * проброс наружу.
 */
async function notifyDeactivated(email: string | null, name: string | null, requestedAt: Date) {
  if (!email) return;
  try {
    await sendAccountDeletionRequestedEmail(email, name || "друг", accountPurgeDate(requestedAt));
  } catch (error) {
    log.error("account.deletion_email_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const role = session.user?.role;
  if (role === "ADMIN") return NextResponse.json({ error: "Администратор не может быть деактивирован" }, { status: 403 });

  const userId = session.user!.id!;
  const requestedAt = new Date();
  const contact = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (role === "PRACTITIONER") {
    // Deactivate practitioner profile — hide from catalog
    await db.practitioner.updateMany({
      where: { userId },
      data: { status: "SUSPENDED" },
    });
    await db.user.update({
      where: { id: userId },
      data: { deletedAt: requestedAt },
    });
    await logAudit(userId, "ACCOUNT_DELETE", undefined, "Практик деактивировал аккаунт");
    await notifyDeactivated(contact?.email ?? null, contact?.name ?? null, requestedAt);
    return NextResponse.json({ ok: true, message: "Аккаунт практика деактивирован" });
  }

  // CLIENT: mark deleted, schedule purge after 10 days
  await db.user.update({
    where: { id: userId },
    data: { deletedAt: requestedAt },
  });
  await logAudit(userId, "ACCOUNT_DELETE", undefined, "Клиент удалил аккаунт");
  await notifyDeactivated(contact?.email ?? null, contact?.name ?? null, requestedAt);

  return NextResponse.json({
    ok: true,
    message: `Аккаунт деактивирован. Через ${ACCOUNT_SOFT_DELETE_GRACE_DAYS} дней данные будут удалены.`,
  });
}
