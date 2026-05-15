export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { JobActions } from "./job-actions";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  RUNNING: "border-blue-500/25 bg-blue-500/10 text-blue-300",
  SUCCEEDED: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  FAILED: "border-red-500/25 bg-red-500/10 text-red-300",
  DEAD: "border-red-700/25 bg-red-700/10 text-red-400",
};

export default async function AdminJobsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read")) redirect("/admin");

  const [stats, recentFailed, queueSummary] = await Promise.all([
    Promise.all([
      db.job.count({ where: { status: "PENDING" } }),
      db.job.count({ where: { status: "RUNNING" } }),
      db.job.count({ where: { status: "FAILED" } }),
      db.job.count({ where: { status: "DEAD" } }),
      db.job.count({ where: { status: "SUCCEEDED" } }),
    ]),
    db.job.findMany({
      where: { status: { in: ["FAILED", "DEAD"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        queue: true,
        type: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        runAfter: true,
      },
    }),
    db.job.groupBy({
      by: ["queue", "status"],
      _count: { id: true },
      orderBy: { queue: "asc" },
    }),
  ]);

  const [pending, running, failed, dead, succeeded] = stats;

  const queueMap: Record<string, Record<string, number>> = {};
  for (const row of queueSummary) {
    if (!queueMap[row.queue]) queueMap[row.queue] = {};
    queueMap[row.queue][row.status] = row._count.id;
  }

  return (
    <PageContainer maxWidth="6xl">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Очередь задач</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Диагностика фоновых задач и повторный запуск упавших.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-5">
        {[
          { label: "Pending", value: pending, color: "text-amber-400" },
          { label: "Running", value: running, color: "text-blue-400" },
          { label: "Failed", value: failed, color: "text-red-400" },
          { label: "Dead", value: dead, color: "text-red-600" },
          { label: "Succeeded", value: succeeded, color: "text-emerald-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-border/30 bg-card/40 p-4">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString("ru")}</p>
          </div>
        ))}
      </div>

      {/* Queue summary */}
      {Object.keys(queueMap).length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">По очередям</h2>
          <div className="overflow-hidden rounded-lg border border-border/30 bg-card/30">
            <div className="grid grid-cols-[1fr_0.5fr_0.5fr_0.5fr_0.5fr_0.5fr] gap-2 border-b border-border/20 px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
              <span>Очередь</span>
              <span>Pending</span>
              <span>Running</span>
              <span>Failed</span>
              <span>Dead</span>
              <span>Done</span>
            </div>
            {Object.entries(queueMap).map(([queue, counts]) => (
              <div key={queue} className="grid grid-cols-[1fr_0.5fr_0.5fr_0.5fr_0.5fr_0.5fr] gap-2 px-4 py-3 text-sm border-b border-border/10 last:border-0">
                <span className="font-mono text-xs">{queue}</span>
                <span className="text-amber-400">{counts.PENDING ?? 0}</span>
                <span className="text-blue-400">{counts.RUNNING ?? 0}</span>
                <span className="text-red-400">{counts.FAILED ?? 0}</span>
                <span className="text-red-600">{counts.DEAD ?? 0}</span>
                <span className="text-emerald-400">{counts.SUCCEEDED ?? 0}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Failed / Dead jobs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Упавшие задачи ({recentFailed.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-border/30 bg-card/30">
          {recentFailed.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Упавших задач нет — всё работает исправно.
            </div>
          ) : (
            <div className="divide-y divide-border/10">
              {recentFailed.map((job) => (
                <div key={job.id} className="px-4 py-3 text-sm" data-testid="admin-job-row">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{job.queue}</span>
                        <span className="font-medium">{job.type}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[job.status] ?? ""}`}>
                          {job.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {job.attempts}/{job.maxAttempts} попыток
                        </span>
                      </div>
                      {job.error && (
                        <p className="mt-1 text-xs text-red-300 line-clamp-2">{job.error}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground/60">
                        Создана: {job.createdAt.toLocaleString("ru-RU")} ·{" "}
                        Обновлена: {job.updatedAt.toLocaleString("ru-RU")}
                      </p>
                    </div>
                    <JobActions jobId={job.id} status={job.status} maxAttempts={job.maxAttempts} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </PageContainer>
  );
}
