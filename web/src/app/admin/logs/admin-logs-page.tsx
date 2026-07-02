export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { LogsTabs } from "./logs-viewer";
import { PageContainer } from "@/components/ui/page-container";
import { AdminCompactDataTable, type AdminCompactColumn, type AdminCompactRow } from "@/components/admin/compact-client-table";

type SearchParams = {
  q?: string;
  action?: string;
  actor?: string;
  target?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

const PAGE_SIZE = 50;
const AUDIT_LIMIT = 500;
const SORT_FIELDS = ["createdAt", "action", "userId", "targetId"] as const;

function buildWhere(params: SearchParams): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { id: { contains: q, mode: "insensitive" } },
      { userId: { contains: q, mode: "insensitive" } },
      { targetId: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
      { details: { contains: q, mode: "insensitive" } },
      { ip: { contains: q, mode: "insensitive" } },
    ];
  }
  if (params.action?.trim()) where.action = { contains: params.action.trim(), mode: "insensitive" };
  if (params.actor?.trim()) where.userId = { contains: params.actor.trim(), mode: "insensitive" };
  if (params.target?.trim()) where.targetId = { contains: params.target.trim(), mode: "insensitive" };
  return where;
}

function buildOrderBy(params: SearchParams): Prisma.AuditLogOrderByWithRelationInput {
  const field = SORT_FIELDS.includes(params.sort as typeof SORT_FIELDS[number]) ? params.sort! : "createdAt";
  const dir = params.dir === "asc" ? "asc" : "desc";
  return { [field]: dir };
}

function actionTone(action: string) {
  if (action.includes("BLOCK") || action.includes("DELETE") || action.includes("FAILED")) return "danger";
  if (action.includes("RESET") || action.includes("UPDATE") || action.includes("PAYOUT") || action.includes("PAYMENT")) return "warn";
  return "ok";
}

const auditColumns: AdminCompactColumn[] = [
  { key: "createdAt", label: "Время", sortable: true, filterKind: "date" },
  { key: "action", label: "Действие", sortable: true, filterKind: "select" },
  { key: "actor", label: "Актор", sortable: true, filterKind: "text" },
  { key: "target", label: "Цель", sortable: true, filterKind: "text" },
  { key: "ip", label: "IP", sortable: true, filterKind: "text" },
  { key: "details", label: "Детали", sortable: true, filterKind: "text" },
  { key: "id", label: "ID", sortable: true, filterKind: "text" },
];

export default async function AdminLogsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const where = buildWhere(params);
  const logs = await db.auditLog.findMany({
    where,
    orderBy: buildOrderBy(params),
    take: AUDIT_LIMIT,
    select: { id: true, userId: true, targetId: true, action: true, details: true, ip: true, createdAt: true },
  });

  const userIds = [...new Set(logs.flatMap((log) => [log.userId, log.targetId]).filter(Boolean))] as string[];
  const users = userIds.length > 0
    ? await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, role: true },
    })
    : [];
  const userMap = Object.fromEntries(users.map((user) => [user.id, user]));

  const enriched = logs.map((log) => ({
    id: log.id,
    userId: log.userId,
    targetId: log.targetId,
    action: log.action,
    details: log.details,
    ip: log.ip,
    createdAt: log.createdAt.toISOString(),
    actorName: userMap[log.userId]?.name ?? "Система",
    actorEmail: userMap[log.userId]?.email ?? "",
    actorRole: userMap[log.userId]?.role ?? "",
    targetName: log.targetId ? (userMap[log.targetId]?.name ?? log.targetId) : null,
  }));
  const actionOptions = [...new Set(enriched.map((log) => log.action))]
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((action) => ({ value: action, label: action }));
  const rows: AdminCompactRow[] = enriched.map((log) => {
    const createdAt = new Date(log.createdAt);
    const createdAtLabel = createdAt.toLocaleString("ru-RU");
    return {
      id: log.id,
      cells: {
        createdAt: {
          kind: "text",
          value: createdAtLabel,
          filterValue: createdAtLabel,
          sortValue: createdAt.getTime(),
        },
        action: {
          kind: "status",
          label: log.action,
          tone: actionTone(log.action),
          filterValue: log.action,
          sortValue: log.action,
        },
        actor: {
          kind: "text",
          value: log.actorName,
          subvalue: log.actorEmail || log.userId || "",
          filterValue: [log.actorName, log.actorEmail, log.userId, log.actorRole].filter(Boolean).join(" "),
          sortValue: log.actorName,
        },
        target: {
          kind: "text",
          value: log.targetName ?? "нет",
          filterValue: [log.targetName, log.targetId].filter(Boolean).join(" "),
          sortValue: log.targetName ?? "",
        },
        ip: log.ip ?? "нет",
        details: {
          kind: "text",
          value: log.details ?? "нет",
          title: log.details ?? undefined,
          filterValue: log.details ?? "",
          sortValue: log.details ?? "",
        },
        id: {
          kind: "text",
          value: log.id,
          title: log.id,
          filterValue: log.id,
          sortValue: log.id,
        },
      },
    };
  });
  const columns = auditColumns.map((column) => column.key === "action" ? { ...column, options: actionOptions } : column);

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">наблюдаемость</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Журналы и аудит</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit, live diagnostics и runtime-логи приложения для суперадмина.
          </p>
        </div>
        <span className="soft-admin-status-pill">последние {AUDIT_LIMIT} событий</span>
      </div>

      <LogsTabs auditTable={
        <div data-testid="admin-audit-log-table">
          <AdminCompactDataTable
            columns={columns}
            rows={rows}
            empty="События не найдены"
            minWidth="1220px"
            pageSize={PAGE_SIZE}
          />
        </div>
      } />
    </PageContainer>
  );
}
