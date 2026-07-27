import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { canUnlinkLoginProvider, type LoginProvider } from "@/lib/auth-access";
import { logAudit } from "@/lib/audit";
import { unbindTelegramFromUser } from "@/lib/telegram-binding";

const SUPPORTED = new Set<LoginProvider>(["google", "vk", "telegram", "apple"]);

type Params = { params: Promise<{ provider: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const providerParam = (await params).provider.toLowerCase();
  if (!SUPPORTED.has(providerParam as LoginProvider)) {
    return NextResponse.json({ error: "Неподдерживаемый способ входа" }, { status: 400 });
  }
  const provider = providerParam as LoginProvider;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true, provider: true, providerId: true, telegramId: true, telegramUsername: true },
  });
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  const guard = canUnlinkLoginProvider(user, provider);
  if (!guard.allowed) {
    return NextResponse.json({
      error: guard.reason === "last_login_method"
        ? "Сначала назначьте пароль или подключите другой способ входа"
        : "Этот способ входа не подключён",
      code: guard.reason,
    }, { status: guard.reason === "last_login_method" ? 409 : 400 });
  }

  if (provider === "telegram") {
    // INC-088: identity входа снимается вместе с адресом доставки — иначе
    // «отвязал» на экране, а вход из Mini App продолжает работать.
    await unbindTelegramFromUser(user.id);
  } else {
    await db.user.update({ where: { id: user.id }, data: { provider: "web", providerId: null } });
  }

  await logAudit(user.id, "LOGIN_METHOD_UNLINK", undefined, JSON.stringify({ provider }));
  return NextResponse.json({ ok: true, provider });
}
