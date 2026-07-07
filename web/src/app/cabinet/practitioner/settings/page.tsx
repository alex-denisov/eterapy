export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { PractitionerSettingsClient } from "../profile/practitioner-settings-client";

// B466 — «Настройки» (account; mockup -more-settings): уведомления с матрицей
// событие × Email/Telegram/В приложении + привязка Telegram, безопасность
// (пароль), деактивация. Публичный профиль живёт отдельно —
// /practitioner/profile (owner: split Профиль/Настройки).

export default async function PractitionerAccountSettingsPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: {
      id: true,
      user: { select: { email: true, telegramId: true, telegramUsername: true, password: true } },
    },
  });
  if (!practitioner) redirect(appUrl(""));

  const pwd = practitioner.user.password;
  const hasPassword = !!pwd
    && !pwd.startsWith("oauth:")
    && !pwd.startsWith("vk:")
    && !pwd.startsWith("tg:")
    && !pwd.startsWith("telegram:");

  return (
    <PractitionerSettingsClient
      email={practitioner.user.email}
      telegramStatus={{
        linked: !!practitioner.user.telegramId,
        username: practitioner.user.telegramUsername ?? null,
      }}
      hasPassword={hasPassword}
    />
  );
}
