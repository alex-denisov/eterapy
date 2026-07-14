export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { PractitionerSettingsClient } from "../profile/practitioner-settings-client";
import { PractitionerSettingsMobile } from "./settings-mobile";

// B466 — «Настройки» (account; mockup -more-settings): уведомления с матрицей
// событие × Email/Telegram/В приложении + привязка Telegram, безопасность
// (пароль), деактивация. Публичный профиль живёт отдельно —
// /practitioner/profile (owner: split Профиль/Настройки).

export default async function PractitionerAccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: {
      id: true,
      user: { select: { name: true, email: true, telegramId: true, telegramUsername: true, password: true, timezone: true } },
    },
  });
  if (!practitioner) redirect(appUrl(""));

  const pwd = practitioner.user.password;
  const hasPassword = !!pwd
    && !pwd.startsWith("oauth:")
    && !pwd.startsWith("vk:")
    && !pwd.startsWith("tg:")
    && !pwd.startsWith("telegram:");

  const telegramStatus = {
    linked: !!practitioner.user.telegramId,
    username: practitioner.user.telegramUsername ?? null,
  };

  // B466 owner-fix 2026-07-14 #4: «Настроить уведомления» из колокольчика
  // открывает сразу суб-таб «Уведомления» (?tab=notifications).
  const { tab } = await searchParams;
  const initialTab = tab === "notifications" || tab === "interface" || tab === "danger" ? tab : "account";

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 mockup practitioner-more-settings (pcab-native) */}
      <PractitionerSettingsMobile
        telegramStatus={telegramStatus}
        hasPassword={hasPassword}
        backHref={appUrl("/practitioner/more")}
      />

      {/* ДЕСКТОП R9-5 — 1-в-1 practitioner-desktop-settings-v2 (суб-табы
          Аккаунт/Уведомления/Интерфейс/Удаление, пароль — в модалке). */}
      <div className="hidden md:block" data-testid="practitioner-settings-desktop">
        <PractitionerSettingsClient
          name={practitioner.user.name ?? practitioner.user.email}
          email={practitioner.user.email}
          telegramStatus={telegramStatus}
          hasPassword={hasPassword}
          timezone={practitioner.user.timezone ?? "Europe/Moscow"}
          initialTab={initialTab}
        />
      </div>
    </>
  );
}
