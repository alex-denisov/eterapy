import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { ClientsTable } from "./clients-table";
import { getUserPermissions } from "@/lib/moderator-permissions";

export default async function AdminClientsPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user!.id!, role);
  if (!permissions.includes("clients.view")) redirect("/admin");

  const users = await db.user.findMany({
    where: { role: "CLIENT" },
    select: {
      id: true, name: true, email: true, emailVerified: true,
      createdAt: true, blockedAt: true, deletedAt: true, freeToolsLimit: true, avatarUrl: true, provider: true,
    },
    orderBy: { createdAt: "desc" } as const,
    take: 200,
  });

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Клиенты</h1>
        <span className="text-sm text-muted-foreground">Всего: {users.length}</span>
      </div>
      <ClientsTable users={users} adminRole={role} permissions={permissions} />
    </div>
  );
}
