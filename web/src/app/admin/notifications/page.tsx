export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { BellRing, Clock3, RotateCcw, ShieldAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import { getAdminNotificationDiagnostics } from "@/lib/admin-notification-diagnostics";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";

function statusClass(status: string) {
  if (status === "SUCCEEDED") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (status === "PENDING" || status === "RUNNING") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  return "border-red-500/25 bg-red-500/10 text-red-300";
}

export default async function AdminNotificationsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("notifications.diagnose")) redirect("/admin");

  const diagnostics = await getAdminNotificationDiagnostics();
  const statCards = [
    { label: "Pending", value: diagnostics.stats.PENDING, icon: Clock3 },
    { label: "Running", value: diagnostics.stats.RUNNING, icon: RotateCcw },
    { label: "Succeeded", value: diagnostics.stats.SUCCEEDED, icon: BellRing },
    { label: "Dead", value: diagnostics.stats.DEAD, icon: ShieldAlert },
  ];

  return (
    <PageContainer maxWidth="6xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Диагностика уведомлений</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Очередь <code>{diagnostics.jobType}</code>: email, Telegram и web delivery attempts без раскрытия email, Telegram ID и текста payload.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-border/30 bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Icon className="h-4 w-4 text-primary" />
              {label}
            </div>
            <p className="text-2xl font-bold text-primary">{value.toLocaleString("ru")}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Последние delivery jobs</h2>
        <div className="overflow-hidden rounded-lg border border-border/30 bg-card/30">
          <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-border/20 px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
            <span>Событие</span>
            <span>Канал</span>
            <span>Статус</span>
            <span>Retry</span>
          </div>
          <div className="divide-y divide-border/10">
            {diagnostics.recent.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Delivery jobs пока нет</div>
            ) : diagnostics.recent.map((job) => (
              <div key={job.id} className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr] gap-3 px-4 py-3 text-sm" data-testid="notification-diagnostic-row">
                <div className="min-w-0">
                  <p className="truncate font-medium">{job.payload.event ?? "unknown"}</p>
                  <p className="truncate text-xs text-muted-foreground">{job.payload.requestId ?? job.id}</p>
                  {job.error && <p className="mt-1 truncate text-xs text-red-300">{job.error}</p>}
                </div>
                <span className="text-muted-foreground">{job.payload.channel ?? "unknown"}</span>
                <span className={`h-fit w-fit rounded-full border px-2 py-0.5 text-xs ${statusClass(job.status)}`}>{job.status}</span>
                <div className="text-xs text-muted-foreground">
                  <p>{job.attempts}/{job.maxAttempts}</p>
                  <p>{new Date(job.runAfter).toLocaleString("ru-RU")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
