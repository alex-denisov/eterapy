export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { LogsTabs } from "./logs-viewer";
import { PageContainer } from "@/components/ui/page-container";

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
const SORT_FIELDS = ["createdAt", "action", "userId", "targetId"] as const;

function makeUrl(params: SearchParams, patch: Record<string, string | null>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  if (!("page" in patch)) next.set("page", "1");
  const query = next.toString();
  return query ? `/admin/logs?${query}` : "/admin/logs";
}

function HiddenParams({ params, except = [] }: { params: SearchParams; except?: string[] }) {
  return (
    <>
      {Object.entries(params).map(([key, value]) => {
        if (!value || key === "page" || except.includes(key)) return null;
        return <input key={key} type="hidden" name={key} value={value} />;
      })}
    </>
  );
}

function HeaderInput({ params, name, placeholder }: { params: SearchParams; name: keyof SearchParams; placeholder: string }) {
  return (
    <form action="/admin/logs">
      <HiddenParams params={params} except={[name]} />
      <input className="soft-admin-table-filter" name={name} defaultValue={params[name] ?? ""} placeholder={placeholder} />
    </form>
  );
}

function SortLink({ params, field, children }: { params: SearchParams; field: string; children: React.ReactNode }) {
  const active = params.sort === field;
  const dir = params.dir === "asc" ? "asc" : "desc";
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  return (
    <Link className="soft-admin-sort-link" href={makeUrl(params, { sort: field, dir: nextDir })}>
      {children}{active ? ` ${dir === "asc" ? "up" : "down"}` : ""}
    </Link>
  );
}

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
  if (action.includes("RESET") || action.includes("UPDATE") || action.includes("PAYOUT")) return "warn";
  return "ok";
}

export default async function AdminLogsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const page = Math.max(1, Number(params.page) || 1);
  const where = buildWhere(params);
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: buildOrderBy(params),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, userId: true, targetId: true, action: true, details: true, ip: true, createdAt: true },
    }),
    db.auditLog.count({ where }),
  ]);

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
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">observability</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Журнал событий</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit, live diagnostics и runtime-логи приложения для суперадмина.
          </p>
        </div>
        <span className="soft-admin-status-pill">50 событий на страницу</span>
      </div>

      <LogsTabs auditTable={
        <>
      <section className="overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] shadow-[var(--soft-shadow-sm)]">
        <table className="soft-admin-data-table min-w-[1120px]" data-testid="admin-audit-log-table">
          <thead>
            <tr>
              <th><SortLink params={params} field="createdAt">Время</SortLink><HeaderInput params={params} name="q" placeholder="поиск" /></th>
              <th><SortLink params={params} field="action">Действие</SortLink><HeaderInput params={params} name="action" placeholder="action" /></th>
              <th><SortLink params={params} field="userId">Актор</SortLink><HeaderInput params={params} name="actor" placeholder="userId" /></th>
              <th><SortLink params={params} field="targetId">Цель</SortLink><HeaderInput params={params} name="target" placeholder="targetId" /></th>
              <th>IP</th>
              <th>Детали</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {enriched.length === 0 ? (
              <tr><td colSpan={7} className="text-center">События не найдены</td></tr>
            ) : enriched.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.createdAt).toLocaleString("ru-RU")}</td>
                <td><span className="soft-admin-status-pill" data-tone={actionTone(log.action)}>{log.action}</span></td>
                <td>
                  <div>{log.actorName}</div>
                  <div className="text-[0.68rem] text-[var(--soft-ink-faint)]">{log.actorEmail || log.userId}</div>
                </td>
                <td>{log.targetName ?? "нет"}</td>
                <td>{log.ip ?? "нет"}</td>
                <td className="max-w-lg truncate">{log.details ?? "нет"}</td>
                <td className="max-w-44 truncate">{log.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(params, { page: String(Math.max(1, page - 1)) })}>Назад</Link>
        <span className="text-xs text-[var(--soft-ink-faint)]">Показано {enriched.length} из {total.toLocaleString("ru-RU")} · {page} / {pageCount}</span>
        <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(params, { page: String(Math.min(pageCount, page + 1)) })}>Вперёд</Link>
      </div>
        </>
      } />
    </PageContainer>
  );
}
