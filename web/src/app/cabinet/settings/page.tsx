import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // @ts-expect-error custom
  const role = session.user?.role ?? "CLIENT";
  if (role === "ADMIN" || role === "SUPERADMIN") redirect("/admin/settings");

  // Get telegramId for current user
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { telegramId: true, telegramUsername: true },
  });

  return (
    <SettingsClient
      telegramStatus={{
        linked: !!user?.telegramId,
        username: user?.telegramUsername ?? null,
      }}
    />
  );
}
