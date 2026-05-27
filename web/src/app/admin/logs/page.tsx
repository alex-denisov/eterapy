export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { AdminLogsConsole } from "./logs-viewer";
import { PageContainer } from "@/components/ui/page-container";

export default async function AdminLogsPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, userId: true, targetId: true, action: true, details: true, ip: true, createdAt: true },
  });

  // Загружаем имена пользователей отдельно
  const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true },
  });
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const enriched = logs.map(l => ({
    id: l.id,
    userId: l.userId,
    targetId: l.targetId,
    action: l.action,
    details: l.details,
    ip: l.ip,
    createdAt: l.createdAt.toISOString(),
    actorName: userMap[l.userId]?.name ?? "Система",
    actorEmail: userMap[l.userId]?.email ?? "",
    actorRole: userMap[l.userId]?.role ?? "",
    targetName: l.targetId ? (userMap[l.targetId]?.name ?? l.targetId) : null,
  }));

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Журнал событий</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Audit, live diagnostics и runtime-логи приложения для суперадмина</p>
        </div>
        <span className="text-sm text-muted-foreground">Последние {logs.length} записей</span>
      </div>
      <AdminLogsConsole logs={enriched} />
    </PageContainer>
  );
}
