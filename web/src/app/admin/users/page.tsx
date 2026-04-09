import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { UserLimitControl } from "./user-limit-control";

export default async function AdminUsersPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/");

  const users = await db.user.findMany({
    select: {
      id: true, name: true, email: true, role: true, createdAt: true,
      deletedAt: true, emailVerified: true, freeToolsLimit: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Пользователи</h1>
        <span className="text-sm text-muted-foreground">Всего: {users.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/20 text-left text-muted-foreground">
              <th className="pb-3 pr-4 font-medium">Пользователь</th>
              <th className="pb-3 pr-4 font-medium">Роль</th>
              <th className="pb-3 pr-4 font-medium">Статус</th>
              <th className="pb-3 pr-4 font-medium">Лимит инструментов</th>
              <th className="pb-3 font-medium">Регистрация</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {users.map((u) => (
              <tr key={u.id} className={u.deletedAt ? "opacity-50" : ""}>
                <td className="py-3 pr-4">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td className="py-3 pr-4">
                  <Badge variant="secondary" className={
                    u.role === "ADMIN" ? "bg-destructive/10 text-destructive" :
                    u.role === "PRACTITIONER" ? "bg-primary/10 text-primary" :
                    "bg-muted/40 text-muted-foreground"
                  }>{u.role}</Badge>
                </td>
                <td className="py-3 pr-4">
                  {u.deletedAt ? (
                    <span className="text-xs text-destructive">Деактивирован</span>
                  ) : u.emailVerified ? (
                    <span className="text-xs text-green-400">Активен</span>
                  ) : (
                    <span className="text-xs text-yellow-400">Email не подтверждён</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <UserLimitControl
                    userId={u.id}
                    currentLimit={u.freeToolsLimit}
                    role={u.role}
                  />
                </td>
                <td className="py-3 text-xs text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
