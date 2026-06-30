export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";

type SearchParams = {
  table?: string;
  q?: string;
  page?: string;
};

type DbRow = Record<string, string | number | boolean | null>;

const PAGE_SIZE = 50;

const TABLES = [
  "users",
  "practitioners",
  "bookings",
  "transactions",
  "product_entitlements",
  "dialogues",
  "ai_requests",
  "jobs",
  "audit_logs",
] as const;

type TableName = typeof TABLES[number];

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
  return query ? `/admin/ops/database?${query}` : "/admin/ops/database";
}

function stringify(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function toRows<T extends Record<string, unknown>>(rows: T[]): DbRow[] {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, stringify(value)])));
}

async function fetchTable(table: TableName, q: string, page: number) {
  const skip = (page - 1) * PAGE_SIZE;
  if (table === "users") {
    const where: Prisma.UserWhereInput = q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    } : {};
    const [rows, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: { id: true, email: true, name: true, role: true, blockedAt: true, deletedAt: true, createdAt: true },
      }),
      db.user.count({ where }),
    ]);
    return { rows: toRows(rows), total };
  }
  if (table === "practitioners") {
    const where: Prisma.PractitionerWhereInput = q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { title: { contains: q, mode: "insensitive" } },
      ],
    } : {};
    const [rows, total] = await Promise.all([
      db.practitioner.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: { id: true, userId: true, slug: true, status: true, title: true, pricePerSession: true, commissionPercent: true, riskScore: true, createdAt: true },
      }),
      db.practitioner.count({ where }),
    ]);
    return { rows: toRows(rows), total };
  }
  if (table === "bookings") {
    const where: Prisma.BookingWhereInput = q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { clientId: { contains: q, mode: "insensitive" } },
        { practitionerId: { contains: q, mode: "insensitive" } },
      ],
    } : {};
    const [rows, total] = await Promise.all([
      db.booking.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: { id: true, clientId: true, practitionerId: true, status: true, priceRub: true, createdAt: true, updatedAt: true },
      }),
      db.booking.count({ where }),
    ]);
    return { rows: toRows(rows), total };
  }
  if (table === "transactions") {
    const where: Prisma.TransactionWhereInput = q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { userId: { contains: q, mode: "insensitive" } },
        { provider: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    } : {};
    const [rows, total] = await Promise.all([
      db.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: { id: true, userId: true, amount: true, currency: true, status: true, provider: true, description: true, createdAt: true },
      }),
      db.transaction.count({ where }),
    ]);
    return { rows: toRows(rows), total };
  }
  if (table === "product_entitlements") {
    const where: Prisma.ProductEntitlementWhereInput = q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { userId: { contains: q, mode: "insensitive" } },
        { productKey: { contains: q, mode: "insensitive" } },
        { transactionId: { contains: q, mode: "insensitive" } },
      ],
    } : {};
    const [rows, total] = await Promise.all([
      db.productEntitlement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: { id: true, userId: true, productKey: true, source: true, status: true, transactionId: true, consumedAt: true, createdAt: true },
      }),
      db.productEntitlement.count({ where }),
    ]);
    return { rows: toRows(rows), total };
  }
  if (table === "dialogues") {
    const where: Prisma.DialogueWhereInput = q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { userId: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { topic: { contains: q, mode: "insensitive" } },
      ],
    } : {};
    const [rows, total] = await Promise.all([
      db.dialogue.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: { id: true, userId: true, status: true, title: true, topic: true, safetyLevel: true, createdAt: true, updatedAt: true },
      }),
      db.dialogue.count({ where }),
    ]);
    return { rows: toRows(rows), total };
  }
  if (table === "ai_requests") {
    const where: Prisma.AIRequestWhereInput = q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { userId: { contains: q, mode: "insensitive" } },
        { feature: { contains: q, mode: "insensitive" } },
      ],
    } : {};
    const [rows, total] = await Promise.all([
      db.aIRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: { id: true, feature: true, userId: true, status: true, totalTokens: true, estimatedCostMicros: true, createdAt: true, finishedAt: true },
      }),
      db.aIRequest.count({ where }),
    ]);
    return { rows: toRows(rows), total };
  }
  if (table === "jobs") {
    const where: Prisma.JobWhereInput = q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { queue: { contains: q, mode: "insensitive" } },
        { type: { contains: q, mode: "insensitive" } },
        { error: { contains: q, mode: "insensitive" } },
      ],
    } : {};
    const [rows, total] = await Promise.all([
      db.job.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: { id: true, queue: true, type: true, status: true, attempts: true, maxAttempts: true, runAfter: true, error: true, updatedAt: true },
      }),
      db.job.count({ where }),
    ]);
    return { rows: toRows(rows), total };
  }
  const where: Prisma.AuditLogWhereInput = q ? {
    OR: [
      { id: { contains: q, mode: "insensitive" } },
      { userId: { contains: q, mode: "insensitive" } },
      { targetId: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
      { details: { contains: q, mode: "insensitive" } },
    ],
  } : {};
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: { id: true, userId: true, targetId: true, action: true, details: true, ip: true, createdAt: true },
    }),
    db.auditLog.count({ where }),
  ]);
  return { rows: toRows(rows), total };
}

export default async function AdminDatabasePage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read")) redirect("/admin");

  const table = TABLES.includes(params.table as TableName) ? params.table as TableName : "users";
  const page = Math.max(1, Number(params.page) || 1);
  const q = params.q?.trim() ?? "";
  const { rows, total } = await fetchTable(table, q, page);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">database</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">База данных</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Безопасный read-only просмотр ключевых таблиц. Изменения выполняются через доменные админ-экраны.
          </p>
        </div>
        <span className="soft-admin-status-pill">read-only · {PAGE_SIZE}/page</span>
      </div>

      <form action="/admin/ops/database" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
          Таблица
          <select className="soft-admin-table-filter mt-1 h-9 min-w-56" name="table" defaultValue={table}>
            {TABLES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
          Поиск
          <input className="soft-admin-table-filter mt-1 h-9 min-w-80" name="q" defaultValue={q} placeholder="id, email, статус, описание" />
        </label>
        <button className="soft-admin-action" data-variant="primary" type="submit">Открыть</button>
      </form>

      <section className="overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] shadow-[var(--soft-shadow-sm)]">
        <table className="soft-admin-data-table min-w-[1080px]" data-testid="admin-database-browser">
          <thead>
            <tr>
              {columns.length === 0 ? <th>{table}</th> : columns.map((column) => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={Math.max(1, columns.length)} className="text-center">Строки не найдены</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`${table}-${index}`}>
                {columns.map((column) => (
                  <td key={column} className="max-w-md truncate">{String(row[column] ?? "null")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(params, { table, page: String(Math.max(1, page - 1)) })}>Назад</Link>
        <span className="text-xs text-[var(--soft-ink-faint)]">Показано {rows.length} из {total.toLocaleString("ru-RU")} · {page} / {pageCount}</span>
        <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(params, { table, page: String(Math.min(pageCount, page + 1)) })}>Вперёд</Link>
      </div>
    </PageContainer>
  );
}
