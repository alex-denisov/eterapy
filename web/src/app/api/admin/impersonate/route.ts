/**
 * POST /api/admin/impersonate (form field: userId)
 *
 * Войти в кабинет как другой пользователь (ADMIN / SUPERADMIN). Сессия
 * администратора НЕ затрагивается — кабинет открывается в новой вкладке через
 * отдельный `eterapy-imp` cookie.
 *
 * V1 (perf): раньше маршрут генерировал одноразовый токен в БД и делал второй
 * редирект на /api/admin/impersonate/[token], который ставил cookie. Это был
 * лишний кросс-доменный hop + три обращения к БД. Теперь cookie ставится сразу,
 * и браузер идёт прямо в кабинет — на один полный редирект и round-trip меньше.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { appUrl } from "@/lib/subdomain";
import { encodeImpersonationToken, setImpersonationCookie } from "@/lib/impersonation";

export async function POST(req: NextRequest) {
  const session = await auth();
  const impersonatorId = session?.user?.id;
  if (!impersonatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPERADMIN"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "Только администратор и выше" }, { status: 403 });
  }

  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const userId = formData?.get("userId");
  if (typeof userId !== "string") return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, blockedAt: true, deletedAt: true },
  });
  if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (target.role === "SUPERADMIN") {
    return NextResponse.json({ error: "Нельзя войти как суперадмин" }, { status: 403 });
  }
  if (target.blockedAt || target.deletedAt) {
    return NextResponse.json({ error: "Пользователь заблокирован или удалён" }, { status: 403 });
  }

  await logAudit(impersonatorId, "IMPERSONATE", userId, `Вход как ${target.name} (${target.email})`);

  // Set the impersonation cookie directly and redirect straight to the cabinet.
  const cabinet = target.role === "PRACTITIONER" ? "/cabinet/practitioner" : "/cabinet";
  const impToken = await encodeImpersonationToken({
    targetUserId: target.id,
    impersonatorId,
    targetRole: target.role,
  });

  const response = NextResponse.redirect(new URL(appUrl(cabinet), req.url));
  setImpersonationCookie(response, impToken);
  return response;
}
