import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ModeratorsManager } from "./moderators-manager";
import { PageContainer } from "@/components/ui/page-container";

export default async function AdminModeratorsPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  return (
    <PageContainer maxWidth="full">
      <h1 className="font-heading text-2xl font-bold mb-2">Модераторы</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Управление аккаунтами администраторов и их полномочиями.
      </p>
      <ModeratorsManager />
    </PageContainer>
  );
}
