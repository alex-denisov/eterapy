export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { JobStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { AdminJobsTable, type AdminJobTableRow } from "./jobs-table";

const MAX_ROWS = 500;

const queueSummaryColumns: AdminCompactColumn[] = [
  { key: "queue", label: "Очередь", sortable: true },
  { key: "pending", label: "Ожидает", sortable: true, align: "right" },
  { key: "running", label: "В работе", sortable: true, align: "right" },
  { key: "failed", label: "Ошибка", sortable: true, align: "right" },
  { key: "dead", label: "Dead", sortable: true, align: "right" },
  { key: "done", label: "Успешно", sortable: true, align: "right" },
];

export default async function AdminJobsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read")) redirect("/admin");

  const [stats, queueSummary, jobs] = await Promise.all([
    Promise.all([
      db.job.count({ where: { status: JobStatus.PENDING } }),
      db.job.count({ where: { status: JobStatus.RUNNING } }),
      db.job.count({ where: { status: JobStatus.FAILED } }),
      db.job.count({ where: { status: JobStatus.DEAD } }),
      db.job.count({ where: { status: JobStatus.SUCCEEDED } }),
    ]),
    db.job.groupBy({
      by: ["queue", "status"],
      _count: { id: true },
      orderBy: { queue: "asc" },
    }),
    db.job.findMany({
      orderBy: { updatedAt: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        queue: true,
        type: true,
        status: true,
        priority: true,
        attempts: true,
        maxAttempts: true,
        runAfter: true,
        lockedBy: true,
        error: true,
        updatedAt: true,
      },
    }),
  ]);

  const [pending, running, failed, dead, succeeded] = stats;
  const queueMap: Record<string, Record<string, number>> = {};
  for (const row of queueSummary) {
    if (!queueMap[row.queue]) queueMap[row.queue] = {};
    queueMap[row.queue][row.status] = row._count.id;
  }

  const tableRows: AdminJobTableRow[] = jobs.map((job) => ({
    ...job,
    status: job.status,
    runAfter: job.runAfter.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  }));

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">система</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Очереди и задачи</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Durable jobs с фильтрами в заголовках, пагинацией по 20 и перезапуском упавших задач.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["Ожидает", pending, "warn"],
            ["В работе", running, "warn"],
            ["Ошибки", failed, "danger"],
            ["Dead", dead, "danger"],
            ["Успешно", succeeded, "ok"],
          ].map(([label, value, tone]) => (
            <span key={String(label)} className="soft-admin-status-pill" data-tone={tone}>
              {label}: {Number(value).toLocaleString("ru-RU")}
            </span>
          ))}
        </div>
      </div>

      {Object.keys(queueMap).length > 0 ? (
        <section className="mb-5">
          <AdminCompactDataTable
            columns={queueSummaryColumns}
            rows={Object.entries(queueMap).map(([queue, counts]) => ({
              id: queue,
              cells: {
                queue,
                pending: { value: counts.PENDING ?? 0, sortValue: counts.PENDING ?? 0 },
                running: { value: counts.RUNNING ?? 0, sortValue: counts.RUNNING ?? 0 },
                failed: { value: counts.FAILED ?? 0, sortValue: counts.FAILED ?? 0 },
                dead: { value: counts.DEAD ?? 0, sortValue: counts.DEAD ?? 0 },
                done: { value: counts.SUCCEEDED ?? 0, sortValue: counts.SUCCEEDED ?? 0 },
              },
            }))}
            empty="Очереди пока пустые"
            minWidth="780px"
          />
        </section>
      ) : null}

      <section data-testid="admin-jobs-table">
        <AdminJobsTable rows={tableRows} />
      </section>

      {jobs.length >= MAX_ROWS ? (
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">Показаны последние {MAX_ROWS.toLocaleString("ru-RU")} задач. Для узкого среза используйте фильтры в заголовках таблицы.</p>
      ) : null}
    </PageContainer>
  );
}
