export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { JobStatus, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { JobActions } from "./job-actions";

type SearchParams = {
  q?: string;
  queue?: string;
  type?: string;
  status?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

const PAGE_SIZE = 25;
const SORT_FIELDS = ["createdAt", "updatedAt", "runAfter", "queue", "type", "status", "attempts", "priority"] as const;

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
  return query ? `/admin/jobs?${query}` : "/admin/jobs";
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
    <form action="/admin/jobs">
      <HiddenParams params={params} except={[name]} />
      <input className="soft-admin-table-filter" name={name} defaultValue={params[name] ?? ""} placeholder={placeholder} />
    </form>
  );
}

function HeaderSelect({ params, name, options }: { params: SearchParams; name: keyof SearchParams; options: Array<{ value: string; label: string }> }) {
  return (
    <form action="/admin/jobs">
      <HiddenParams params={params} except={[name]} />
      <select className="soft-admin-table-filter" name={name} defaultValue={params[name] ?? ""}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <button className="soft-admin-action mt-1" type="submit">ok</button>
    </form>
  );
}

function statusTone(status: string) {
  if (status === JobStatus.SUCCEEDED) return "ok";
  if (status === JobStatus.FAILED || status === JobStatus.DEAD) return "danger";
  return "warn";
}

function buildWhere(params: SearchParams): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {};
  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { id: { contains: q, mode: "insensitive" } },
      { queue: { contains: q, mode: "insensitive" } },
      { type: { contains: q, mode: "insensitive" } },
      { error: { contains: q, mode: "insensitive" } },
      { lockedBy: { contains: q, mode: "insensitive" } },
    ];
  }
  if (params.queue?.trim()) where.queue = { contains: params.queue.trim(), mode: "insensitive" };
  if (params.type?.trim()) where.type = { contains: params.type.trim(), mode: "insensitive" };
  if (params.status && Object.values(JobStatus).includes(params.status as JobStatus)) {
    where.status = params.status as JobStatus;
  }
  return where;
}

function buildOrderBy(params: SearchParams): Prisma.JobOrderByWithRelationInput {
  const field = SORT_FIELDS.includes(params.sort as typeof SORT_FIELDS[number]) ? params.sort! : "updatedAt";
  const dir = params.dir === "asc" ? "asc" : "desc";
  return { [field]: dir };
}

export default async function AdminJobsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read")) redirect("/admin");

  const page = Math.max(1, Number(params.page) || 1);
  const where = buildWhere(params);
  const orderBy = buildOrderBy(params);
  const [stats, queueSummary, jobs, total] = await Promise.all([
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
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
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
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        finishedAt: true,
      },
    }),
    db.job.count({ where }),
  ]);

  const [pending, running, failed, dead, succeeded] = stats;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queueMap: Record<string, Record<string, number>> = {};
  for (const row of queueSummary) {
    if (!queueMap[row.queue]) queueMap[row.queue] = {};
    queueMap[row.queue][row.status] = row._count.id;
  }

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">система</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Очереди и задачи</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Все durable jobs с фильтрами в заголовках, пагинацией по 25 и перезапуском упавших задач.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["Pending", pending, "warn"],
            ["Running", running, "warn"],
            ["Failed", failed, "danger"],
            ["Dead", dead, "danger"],
            ["Done", succeeded, "ok"],
          ].map(([label, value, tone]) => (
            <span key={String(label)} className="soft-admin-status-pill" data-tone={tone}>
              {label}: {Number(value).toLocaleString("ru-RU")}
            </span>
          ))}
        </div>
      </div>

      {Object.keys(queueMap).length > 0 && (
        <section className="mb-5 overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3 shadow-[var(--soft-shadow-sm)]">
          <table className="soft-admin-data-table min-w-[780px]">
            <thead>
              <tr><th>Очередь</th><th>Pending</th><th>Running</th><th>Failed</th><th>Dead</th><th>Done</th></tr>
            </thead>
            <tbody>
              {Object.entries(queueMap).map(([queue, counts]) => (
                <tr key={queue}>
                  <td>{queue}</td>
                  <td>{counts.PENDING ?? 0}</td>
                  <td>{counts.RUNNING ?? 0}</td>
                  <td>{counts.FAILED ?? 0}</td>
                  <td>{counts.DEAD ?? 0}</td>
                  <td>{counts.SUCCEEDED ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] shadow-[var(--soft-shadow-sm)]">
        <table className="soft-admin-data-table min-w-[1240px]" data-testid="admin-jobs-table">
          <thead>
            <tr>
              <th><SortLink params={params} field="queue">Очередь</SortLink><HeaderInput params={params} name="queue" placeholder="queue" /></th>
              <th><SortLink params={params} field="type">Тип</SortLink><HeaderInput params={params} name="type" placeholder="type" /></th>
              <th><SortLink params={params} field="status">Статус</SortLink><HeaderSelect params={params} name="status" options={[{ value: "", label: "Все" }, ...Object.values(JobStatus).map((item) => ({ value: item, label: item }))]} /></th>
              <th><SortLink params={params} field="attempts">Попытки</SortLink></th>
              <th><SortLink params={params} field="priority">Приоритет</SortLink></th>
              <th><SortLink params={params} field="runAfter">Run after</SortLink></th>
              <th>Locked</th>
              <th><SortLink params={params} field="updatedAt">Обновлено</SortLink><HeaderInput params={params} name="q" placeholder="id/error/locked" /></th>
              <th>Ошибка</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr><td colSpan={10} className="text-center">Задачи не найдены</td></tr>
            ) : jobs.map((job) => (
              <tr key={job.id} data-testid="admin-job-row">
                <td>{job.queue}</td>
                <td>{job.type}</td>
                <td><span className="soft-admin-status-pill" data-tone={statusTone(job.status)}>{job.status}</span></td>
                <td>{job.attempts}/{job.maxAttempts}</td>
                <td>{job.priority}</td>
                <td>{job.runAfter.toLocaleString("ru-RU")}</td>
                <td>{job.lockedBy ?? "нет"}</td>
                <td>{job.updatedAt.toLocaleString("ru-RU")}</td>
                <td className="max-w-md truncate">{job.error ?? "нет"}</td>
                <td><JobActions jobId={job.id} status={job.status} maxAttempts={job.maxAttempts} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(params, { page: String(Math.max(1, page - 1)) })}>Назад</Link>
        <span className="text-xs text-[var(--soft-ink-faint)]">Показано {jobs.length} из {total.toLocaleString("ru-RU")} · {page} / {pageCount}</span>
        <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(params, { page: String(Math.min(pageCount, page + 1)) })}>Вперёд</Link>
      </div>
    </PageContainer>
  );
}
