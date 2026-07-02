export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";

type SearchParams = {
  table?: string;
};

type DbRow = Record<string, string | number | boolean | null>;

const MAX_ROWS = 500;

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
  const skip = (page - 1) * MAX_ROWS;
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
        take: MAX_ROWS,
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
        take: MAX_ROWS,
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
        take: MAX_ROWS,
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
        take: MAX_ROWS,
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
        take: MAX_ROWS,
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
        take: MAX_ROWS,
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
        take: MAX_ROWS,
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
        take: MAX_ROWS,
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
      take: MAX_ROWS,
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
  const { rows, total } = await fetchTable(table, "", 1);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const tableColumns: AdminCompactColumn[] = columns.length > 0
    ? columns.map((column) => ({
      key: column,
      label: column,
      sortable: true,
      filterKind: column.toLowerCase().includes("at") ? "date" : "text",
    }))
    : [{ key: "empty", label: table, filterKind: "none" }];

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">база данных</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">База данных</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Безопасный просмотр ключевых таблиц только на чтение. Изменения выполняются через доменные админ-экраны.
          </p>
        </div>
        <span className="soft-admin-status-pill">только чтение · до {MAX_ROWS.toLocaleString("ru-RU")} строк</span>
      </div>

      <form action="/admin/ops/database" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
          Таблица
          <select className="mt-1 h-9 min-w-56 rounded border border-[var(--soft-paper-edge)] bg-white/85 px-2 text-xs text-[var(--soft-ink)] outline-none focus:bg-white focus:ring-1 focus:ring-[var(--soft-bordeaux)]" name="table" defaultValue={table}>
            {TABLES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <button className="soft-admin-action" data-variant="primary" type="submit">Открыть</button>
      </form>

      <section data-testid="admin-database-browser">
        <AdminCompactDataTable
          columns={tableColumns}
          rows={rows.map((row, index) => ({
            id: `${table}-${index}`,
            cells: Object.fromEntries(columns.map((column) => {
              const raw = row[column];
              const value = String(raw ?? "null");
              const dateValue = column.toLowerCase().includes("at") ? new Date(value).getTime() : Number.NaN;
              return [column, {
                value,
                title: value,
                filterValue: value,
                sortValue: typeof raw === "number" ? raw : Number.isFinite(dateValue) ? dateValue : value,
              }];
            })),
          }))}
          empty="Строки не найдены"
          minWidth="1080px"
        />
      </section>

      {total > MAX_ROWS ? (
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">Показаны последние {MAX_ROWS.toLocaleString("ru-RU")} строк из {total.toLocaleString("ru-RU")}.</p>
      ) : null}
    </PageContainer>
  );
}
