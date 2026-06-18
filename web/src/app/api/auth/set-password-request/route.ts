import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { usersDb } from "@/lib/users-db";
import { sendPasswordResetEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { hasPasswordLogin } from "@/lib/auth-access";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, password: true },
  });
  if (!user?.email) return NextResponse.json({ error: "Email аккаунта не найден" }, { status: 400 });

  if (hasPasswordLogin(user.password)) {
    return NextResponse.json({ error: "Пароль уже назначен. Используйте смену пароля." }, { status: 400 });
  }

  const token = await usersDb.setResetToken(user.email);
  if (!token) return NextResponse.json({ error: "Не удалось создать ссылку" }, { status: 500 });

  try {
    await sendPasswordResetEmail(user.email, user.name, token);
    await logAudit(user.id, "PASSWORD_SET_REQUEST", undefined, "Запрошено назначение пароля для OAuth-аккаунта");
  } catch (emailErr) {
    log.error("set_password_request.email_failed", { err: emailErr });
    return NextResponse.json({ error: "Не удалось отправить письмо" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
