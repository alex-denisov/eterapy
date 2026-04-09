import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const role = session.user?.role;
  if (role === "ADMIN") return NextResponse.json({ error: "Администратор не может быть деактивирован" }, { status: 403 });

  const userId = session.user!.id!;

  if (role === "PRACTITIONER") {
    // Deactivate practitioner profile — hide from catalog
    await db.practitioner.updateMany({
      where: { userId },
      data: { status: "SUSPENDED" },
    });
    await db.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
    await logAudit(userId, "ACCOUNT_DELETE", undefined, "Практик деактивировал аккаунт");
    return NextResponse.json({ ok: true, message: "Аккаунт практика деактивирован" });
  }

  // CLIENT: mark deleted, schedule purge after 10 days
  await db.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });
  await logAudit(userId, "ACCOUNT_DELETE", undefined, "Клиент удалил аккаунт");

  return NextResponse.json({ ok: true, message: "Аккаунт деактивирован. Через 10 дней данные будут удалены." });
}
