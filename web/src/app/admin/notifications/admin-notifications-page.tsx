export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { JobStatus, Prisma } from "@prisma/client";
import { BellRing, Clock3, RotateCcw, ShieldAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { NOTIFICATION_DELIVERY_JOB_TYPE } from "@/lib/notification-delivery";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { roleLabelRu } from "@/lib/mask-email";
import { PageContainer } from "@/components/ui/page-container";
import { AdminNotificationJobsTable, type AdminNotificationJobTableRow } from "../jobs/jobs-table";

type DeliveryPayload = {
  userId?: string;
  event?: string;
  channel?: string;
  requestId?: string;
};

const MAX_ROWS = 500;

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

export default async function AdminNotificationsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("notifications.diagnose")) redirect("/admin");

  const [grouped, jobs] = await Promise.all([
    db.job.groupBy({
      by: ["status"],
      where: { type: NOTIFICATION_DELIVERY_JOB_TYPE },
      _count: { _all: true },
    }),
    db.job.findMany({
      where: { type: NOTIFICATION_DELIVERY_JOB_TYPE },
      orderBy: { updatedAt: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        runAfter: true,
        error: true,
        payload: true,
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

  const normalized = jobs.map((job) => ({ ...job, payload: payloadSummary(job.payload) }));
  const recipientIds = Array.from(new Set(normalized.map((job) => job.payload.userId).filter((id): id is string => Boolean(id))));
  const recipients = recipientIds.length
    ? await db.user.findMany({ where: { id: { in: recipientIds } }, select: { id: true, name: true, email: true, role: true } })
    : [];
  const recipientById = new Map(recipients.map((user) => [user.id, user]));
  function recipientLabel(userId: string | undefined): { who: string; role: string } {
    if (!userId) return { who: "—", role: "—" };
    const user = recipientById.get(userId);
    if (!user) return { who: `id:${userId.slice(0, 8)}`, role: "—" };
    return { who: user.name?.trim() || user.email, role: `${roleLabelRu(user.role)} · ${user.email}` };
  }

  const statCards = [
    { label: "Ожидает", value: stats.PENDING, icon: Clock3, tone: "warn" },
    { label: "В работе", value: stats.RUNNING, icon: RotateCcw, tone: "warn" },
    { label: "Успешно", value: stats.SUCCEEDED, icon: BellRing, tone: "ok" },
    { label: "Dead", value: stats.DEAD, icon: ShieldAlert, tone: "danger" },
  ];

  const tableRows: AdminNotificationJobTableRow[] = normalized.map((job) => {
    const recipient = recipientLabel(job.payload.userId);
    return {
      id: job.id,
      event: job.payload.event ?? "unknown",
      channel: job.payload.channel ?? "unknown",
      recipient: recipient.who,
      recipientRole: recipient.role,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      requestId: job.payload.requestId ?? job.id,
      runAfter: job.runAfter.toISOString(),
      error: job.error,
      updatedAt: job.updatedAt.toISOString(),
    };
  });

  return (
    <PageContainer maxWidth="full" className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">уведомления</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Диагностика уведомлений</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Очередь доставки email, Telegram и web-уведомлений с колоночным поиском и повторной отправкой ошибок.
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
        <AdminNotificationJobsTable rows={tableRows} />
      </section>

      {jobs.length >= MAX_ROWS ? (
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">Показаны последние {MAX_ROWS.toLocaleString("ru-RU")} попыток доставки. Для узкого среза используйте фильтры в заголовках таблицы.</p>
      ) : null}
    </PageContainer>
  );
}
