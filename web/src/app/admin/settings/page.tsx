import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSettingsClient } from "./admin-settings-client";

export default async function AdminSettingsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  return (
    <div className="px-6 py-8 max-w-2xl">
      <h1 className="font-heading text-2xl font-bold mb-8">Настройки</h1>
      <AdminSettingsClient
        email={session.user?.email ?? ""}
        name={session.user?.name ?? ""}
        role={role}
      />
    </div>
  );
}
