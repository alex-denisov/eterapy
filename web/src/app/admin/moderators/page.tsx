import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ModeratorsManager } from "./moderators-manager";

export default async function AdminModeratorsPage() {
  const session = await auth();
  // @ts-expect-error custom
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  return (
    <div className="px-6 py-8">
      <h1 className="font-heading text-2xl font-bold mb-2">Модераторы</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Управление аккаунтами администраторов и их полномочиями.
      </p>
      <ModeratorsManager />
    </div>
  );
}
