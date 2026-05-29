import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSettingsClient } from "./admin-settings-client";
import { PageContainer } from "@/components/ui/page-container";

export default async function AdminSettingsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">админ · конфигурация</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Настройки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Аккаунт администратора, безопасность и быстрый доступ к системным разделам.
          </p>
        </div>
        <span className="soft-admin-status-pill" data-tone={role === "SUPERADMIN" ? "ok" : "warn"}>
          {role === "SUPERADMIN" ? "полный контур" : "ограниченный доступ"}
        </span>
      </div>

      <AdminSettingsClient
        email={session.user?.email ?? ""}
        name={session.user?.name ?? ""}
        role={role}
      />
    </PageContainer>
  );
}
