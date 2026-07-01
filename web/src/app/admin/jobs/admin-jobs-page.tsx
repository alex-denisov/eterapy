export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { JobStatus, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { CompactHeader, CompactTableShell, COMPACT_CELL_CLASS, COMPACT_INPUT_CLASS, COMPACT_SELECT_CLASS } from "@/components/admin/compact-table";
import { LinkPagination } from "../admin-analytics-ui";
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
  return query ? `/admin/ops/jobs?${query}` : "/admin/ops/jobs";
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
    <form action="/admin/ops/jobs">
      <HiddenParams params={params} except={[name]} />
      <input className={COMPACT_INPUT_CLASS} name={name} defaultValue={params[name] ?? ""} placeholder={placeholder} />
    </form>
  );
}

function HeaderSelect({ params, name, options }: { params: SearchParams; name: keyof SearchParams; options: Array<{ value: string; label: string }> }) {
  return (
    <form action="/admin/ops/jobs">
      <HiddenParams params={params} except={[name]} />
      <select className={COMPACT_SELECT_CLASS} name={name} defaultValue={params[name] ?? ""}>
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
        <section className="mb-5">
          <CompactTableShell minWidth="780px">
            <thead>
              <tr><CompactHeader label="Очередь" /><CompactHeader label="Pending" /><CompactHeader label="Running" /><CompactHeader label="Failed" /><CompactHeader label="Dead" /><CompactHeader label="Done" /></tr>
            </thead>
            <tbody>
              {Object.entries(queueMap).map(([queue, counts]) => (
                <tr key={queue}>
                  <td className={COMPACT_CELL_CLASS}>{queue}</td>
                  <td className={COMPACT_CELL_CLASS}>{counts.PENDING ?? 0}</td>
                  <td className={COMPACT_CELL_CLASS}>{counts.RUNNING ?? 0}</td>
                  <td className={COMPACT_CELL_CLASS}>{counts.FAILED ?? 0}</td>
                  <td className={COMPACT_CELL_CLASS}>{counts.DEAD ?? 0}</td>
                  <td className={COMPACT_CELL_CLASS}>{counts.SUCCEEDED ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </CompactTableShell>
        </section>
      )}

      <section data-testid="admin-jobs-table">
        <CompactTableShell minWidth="1240px">
          <thead>
            <tr>
              <CompactHeader label="Очередь"><SortLink params={params} field="queue">Сортировать</SortLink><HeaderInput params={params} name="queue" placeholder="queue" /></CompactHeader>
              <CompactHeader label="Тип"><SortLink params={params} field="type">Сортировать</SortLink><HeaderInput params={params} name="type" placeholder="type" /></CompactHeader>
              <CompactHeader label="Статус"><SortLink params={params} field="status">Сортировать</SortLink><HeaderSelect params={params} name="status" options={[{ value: "", label: "Все" }, ...Object.values(JobStatus).map((item) => ({ value: item, label: item }))]} /></CompactHeader>
              <CompactHeader label="Попытки"><SortLink params={params} field="attempts">Сортировать</SortLink></CompactHeader>
              <CompactHeader label="Приоритет"><SortLink params={params} field="priority">Сортировать</SortLink></CompactHeader>
              <CompactHeader label="Run after"><SortLink params={params} field="runAfter">Сортировать</SortLink></CompactHeader>
              <CompactHeader label="Locked" />
              <CompactHeader label="Обновлено"><SortLink params={params} field="updatedAt">Сортировать</SortLink><HeaderInput params={params} name="q" placeholder="id/error/locked" /></CompactHeader>
              <CompactHeader label="Ошибка" />
              <CompactHeader label="Действия" />
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr><td colSpan={10} className={`${COMPACT_CELL_CLASS} text-center`}>Задачи не найдены</td></tr>
            ) : jobs.map((job) => (
              <tr key={job.id} data-testid="admin-job-row">
                <td className={COMPACT_CELL_CLASS}>{job.queue}</td>
                <td className={COMPACT_CELL_CLASS}>{job.type}</td>
                <td className={COMPACT_CELL_CLASS}><span className="soft-admin-status-pill" data-tone={statusTone(job.status)}>{job.status}</span></td>
                <td className={COMPACT_CELL_CLASS}>{job.attempts}/{job.maxAttempts}</td>
                <td className={COMPACT_CELL_CLASS}>{job.priority}</td>
                <td className={COMPACT_CELL_CLASS}>{job.runAfter.toLocaleString("ru-RU")}</td>
                <td className={COMPACT_CELL_CLASS}>{job.lockedBy ?? "нет"}</td>
                <td className={COMPACT_CELL_CLASS}>{job.updatedAt.toLocaleString("ru-RU")}</td>
                <td className={`${COMPACT_CELL_CLASS} max-w-md truncate`}>{job.error ?? "нет"}</td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}><JobActions jobId={job.id} status={job.status} maxAttempts={job.maxAttempts} /></td>
              </tr>
            ))}
          </tbody>
        </CompactTableShell>
      </section>

      <LinkPagination page={page} pageSize={PAGE_SIZE} total={total} hrefForPage={(nextPage) => makeUrl(params, { page: String(nextPage) })} />
    </PageContainer>
  );
}
