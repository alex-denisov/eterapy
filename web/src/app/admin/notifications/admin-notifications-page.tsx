export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { JobStatus, Prisma } from "@prisma/client";
import { BellRing, Clock3, RotateCcw, ShieldAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { NOTIFICATION_DELIVERY_JOB_TYPE } from "@/lib/notification-delivery";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { maskEmail, roleLabelRu } from "@/lib/mask-email";
import { PageContainer } from "@/components/ui/page-container";
import { CompactHeader, CompactTableShell, COMPACT_CELL_CLASS, COMPACT_INPUT_CLASS, COMPACT_SELECT_CLASS } from "@/components/admin/compact-table";
import { LinkPagination } from "../admin-analytics-ui";
import { JobActions } from "../jobs/job-actions";

type SearchParams = {
  q?: string;
  event?: string;
  channel?: string;
  status?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

type DeliveryPayload = {
  userId?: string;
  event?: string;
  channel?: string;
  requestId?: string;
};

const PAGE_SIZE = 25;
const MAX_SCAN = 1000;
const SORT_FIELDS = ["createdAt", "updatedAt", "runAfter", "status", "attempts"] as const;

function payloadSummary(payload: Prisma.JsonValue | null): DeliveryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const value = payload as Record<string, unknown>;
  return {
    userId: typeof value.userId === "string" ? value.userId : undefined,
    event: typeof value.event === "string" ? value.event : undefined,
    channel: typeof value.channel === "string" ? value.channel : undefined,
    requestId: typeof value.requestId === "string" ? value.requestId : undefined,
  };
}

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
  return query ? `/admin/ops/notifications?${query}` : "/admin/ops/notifications";
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

function HeaderInput({ params, name, placeholder }: { params: SearchParams; name: keyof SearchParams; placeholder: string }) {
  return (
    <form action="/admin/ops/notifications">
      <HiddenParams params={params} except={[name]} />
      <input className={COMPACT_INPUT_CLASS} name={name} defaultValue={params[name] ?? ""} placeholder={placeholder} />
    </form>
  );
}

function HeaderSelect({ params, name, options }: { params: SearchParams; name: keyof SearchParams; options: Array<{ value: string; label: string }> }) {
  return (
    <form action="/admin/ops/notifications">
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

function buildOrderBy(params: SearchParams): Prisma.JobOrderByWithRelationInput {
  const field = SORT_FIELDS.includes(params.sort as typeof SORT_FIELDS[number]) ? params.sort! : "createdAt";
  const dir = params.dir === "asc" ? "asc" : "desc";
  return { [field]: dir };
}

function matchesText(job: { id: string; error: string | null; payload: DeliveryPayload }, query: string) {
  const q = query.toLowerCase();
  return [
    job.id,
    job.error ?? "",
    job.payload.userId ?? "",
    job.payload.event ?? "",
    job.payload.channel ?? "",
    job.payload.requestId ?? "",
  ].some((value) => value.toLowerCase().includes(q));
}

export default async function AdminNotificationsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("notifications.diagnose")) redirect("/admin");

  const page = Math.max(1, Number(params.page) || 1);
  const where: Prisma.JobWhereInput = { type: NOTIFICATION_DELIVERY_JOB_TYPE };
  if (params.status && Object.values(JobStatus).includes(params.status as JobStatus)) {
    where.status = params.status as JobStatus;
  }

  const [grouped, scanned] = await Promise.all([
    db.job.groupBy({
      by: ["status"],
      where: { type: NOTIFICATION_DELIVERY_JOB_TYPE },
      _count: { _all: true },
    }),
    db.job.findMany({
      where,
      orderBy: buildOrderBy(params),
      take: MAX_SCAN,
      select: {
        id: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        runAfter: true,
        error: true,
        payload: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const stats: Record<JobStatus, number> = {
    PENDING: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    DEAD: 0,
  };
  for (const row of grouped) stats[row.status] = row._count._all;

  const normalized = scanned.map((job) => ({ ...job, payload: payloadSummary(job.payload) }));
  const filtered = normalized.filter((job) => {
    if (params.channel?.trim() && (job.payload.channel ?? "").toLowerCase() !== params.channel.trim().toLowerCase()) return false;
    if (params.event?.trim() && !(job.payload.event ?? "").toLowerCase().includes(params.event.trim().toLowerCase())) return false;
    if (params.q?.trim() && !matchesText(job, params.q.trim())) return false;
    return true;
  });
  const total = filtered.length;
  const jobs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // B359 / Баг 17: resolve «кому» for the visible page only — role + masked
  // email so admins know the recipient without the table leaking full PII.
  const recipientIds = Array.from(new Set(jobs.map((job) => job.payload.userId).filter((id): id is string => Boolean(id))));
  const recipients = recipientIds.length
    ? await db.user.findMany({ where: { id: { in: recipientIds } }, select: { id: true, name: true, email: true, role: true } })
    : [];
  const recipientById = new Map(recipients.map((u) => [u.id, u]));
  function recipientLabel(userId: string | undefined): { who: string; role: string } {
    if (!userId) return { who: "—", role: "—" };
    const user = recipientById.get(userId);
    if (!user) return { who: `id:${userId.slice(0, 8)}`, role: "—" };
    return { who: user.name?.trim() || maskEmail(user.email), role: roleLabelRu(user.role) };
  }

  const statCards = [
    { label: "Pending", value: stats.PENDING, icon: Clock3, tone: "warn" },
    { label: "Running", value: stats.RUNNING, icon: RotateCcw, tone: "warn" },
    { label: "Succeeded", value: stats.SUCCEEDED, icon: BellRing, tone: "ok" },
    { label: "Dead", value: stats.DEAD, icon: ShieldAlert, tone: "danger" },
  ];

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">уведомления</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Диагностика уведомлений</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Очередь <code>{NOTIFICATION_DELIVERY_JOB_TYPE}</code>: email, Telegram и web delivery attempts без раскрытия PII payload.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statCards.map(({ label, value, icon: Icon, tone }) => (
            <span key={label} className="soft-admin-status-pill gap-1.5" data-tone={tone}>
              <Icon className="size-3.5" aria-hidden="true" />
              {label}: {value.toLocaleString("ru-RU")}
            </span>
          ))}
        </div>
      </div>

      <section data-testid="admin-notification-jobs-table">
        <CompactTableShell minWidth="1320px">
          <thead>
            <tr>
              <CompactHeader label="Событие"><SortLink params={params} field="createdAt">Сортировать</SortLink><HeaderInput params={params} name="event" placeholder="event" /></CompactHeader>
              <CompactHeader label="Канал"><HeaderInput params={params} name="channel" placeholder="email/web/telegram" /></CompactHeader>
              <CompactHeader label="Кому" />
              <CompactHeader label="Статус"><SortLink params={params} field="status">Сортировать</SortLink><HeaderSelect params={params} name="status" options={[{ value: "", label: "Все" }, ...Object.values(JobStatus).map((item) => ({ value: item, label: item }))]} /></CompactHeader>
              <CompactHeader label="Retry"><SortLink params={params} field="attempts">Сортировать</SortLink></CompactHeader>
              <CompactHeader label="Request" />
              <CompactHeader label="Run after"><SortLink params={params} field="runAfter">Сортировать</SortLink></CompactHeader>
              <CompactHeader label="Обновлено"><SortLink params={params} field="updatedAt">Сортировать</SortLink><HeaderInput params={params} name="q" placeholder="поиск" /></CompactHeader>
              <CompactHeader label="Ошибка" />
              <CompactHeader label="Действия" />
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr><td colSpan={10} className={`${COMPACT_CELL_CLASS} text-center`}>Delivery jobs пока нет</td></tr>
            ) : jobs.map((job) => (
              <tr key={job.id} data-testid="notification-diagnostic-row">
                <td className={COMPACT_CELL_CLASS}>{job.payload.event ?? "unknown"}</td>
                <td className={COMPACT_CELL_CLASS}>{job.payload.channel ?? "unknown"}</td>
                <td className={`${COMPACT_CELL_CLASS} max-w-44 truncate`} title={recipientLabel(job.payload.userId).who}>
                  {recipientLabel(job.payload.userId).who}
                  <span className="ml-1 text-[var(--soft-ink-faint)]">· {recipientLabel(job.payload.userId).role}</span>
                </td>
                <td className={COMPACT_CELL_CLASS}><span className="soft-admin-status-pill" data-tone={statusTone(job.status)}>{job.status}</span></td>
                <td className={COMPACT_CELL_CLASS}>{job.attempts}/{job.maxAttempts}</td>
                <td className={`${COMPACT_CELL_CLASS} max-w-44 truncate`}>{job.payload.requestId ?? job.id}</td>
                <td className={COMPACT_CELL_CLASS}>{job.runAfter.toLocaleString("ru-RU")}</td>
                <td className={COMPACT_CELL_CLASS}>{job.updatedAt.toLocaleString("ru-RU")}</td>
                <td className={`${COMPACT_CELL_CLASS} max-w-md truncate`}>{job.error ?? "нет"}</td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}><JobActions jobId={job.id} status={job.status} maxAttempts={job.maxAttempts} label="Отправить" /></td>
              </tr>
            ))}
          </tbody>
        </CompactTableShell>
      </section>

      <LinkPagination page={page} pageSize={PAGE_SIZE} total={total} hrefForPage={(nextPage) => makeUrl(params, { page: String(nextPage) })} />
      {scanned.length >= MAX_SCAN ? <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">Скан ограничен {MAX_SCAN.toLocaleString("ru-RU")} записями</p> : null}
    </PageContainer>
  );
}
