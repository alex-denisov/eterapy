import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { AdminSettingsClient } from "./admin-settings-client";
import { PageContainer } from "@/components/ui/page-container";

export default async function AdminSettingsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  // B6: telegram link status for the on-page notification settings.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { telegramId: true, telegramUsername: true },
  });

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">админ · конфигурация</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Настройки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Аккаунт администратора, безопасность и персональные уведомления.
          </p>
        </div>
      </div>

      <AdminSettingsClient
        email={session.user?.email ?? ""}
        name={session.user?.name ?? ""}
        role={role}
        telegramStatus={{ linked: !!user?.telegramId, username: user?.telegramUsername ?? null }}
      />
    </PageContainer>
  );
}
