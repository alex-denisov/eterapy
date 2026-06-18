export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { SettingsClient } from "./settings-client";
import { adminUrl, loginUrl } from "@/lib/subdomain";
import { hasPasswordLogin, linkedLoginProviders } from "@/lib/auth-access";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());

  const role = session.user?.role ?? "CLIENT";
  if (role === "ADMIN" || role === "SUPERADMIN") redirect(adminUrl("/admin/settings"));

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { telegramId: true, telegramUsername: true, password: true, provider: true, providerId: true },
  });

  const hasPassword = hasPasswordLogin(user?.password);

  return (
    <SettingsClient
      telegramStatus={{
        linked: !!user?.telegramId,
        username: user?.telegramUsername ?? null,
      }}
      hasPassword={hasPassword}
      linkedProviders={user ? linkedLoginProviders(user) : []}
    />
  );
}
