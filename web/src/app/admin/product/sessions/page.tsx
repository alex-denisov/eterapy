export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProductCenterData, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, DataTable, MetricCard, MetricGrid, PeriodToolbar, formatDateTime } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function duration(start: Date | null, end: Date | null) {
  if (!start || !end) return "—";
  return `${Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))} мин`;
}

export default async function ProductSessionsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const period = resolveAdminPeriod(await searchParams);
  const data = await getProductCenterData(period);
  const active = data.sessions.filter((item) => item.status === "ACTIVE" || item.status === "WAITING");
  const withTranscript = data.sessions.filter((item) => item.transcriptText);
  const withSummary = data.sessions.filter((item) => item.summaryText);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminHero
        eyebrow="продукт"
        title="Сессии и транскрипты"
        actions={<PeriodToolbar basePath="/admin/product/sessions" start={period.startInput} end={period.endInput} />}
      >
        Очередь активных и предстоящих сессий, ссылки на сессию, длительность, транскрипт и AI-резюме открываются отдельным действием.
      </AdminHero>
      <MetricGrid>
        <MetricCard label="Активные / ожидают" value={String(active.length)} />
        <MetricCard label="С транскриптом" value={String(withTranscript.length)} />
        <MetricCard label="С AI-резюме" value={String(withSummary.length)} />
        <MetricCard label="Всего за период" value={String(data.sessions.length)} />
      </MetricGrid>
      <div className="mt-6">
        <DataTable
          columns={["Timestamp", "Клиент", "Практик", "Статус", "Длительность", "Сессия", "Транскрипт", "AI-резюме"]}
          rows={data.sessions.slice(0, 20).map((item) => [
            formatDateTime(item.createdAt),
            <span key="client">{item.booking.client.name}<br /><span className="text-xs text-[var(--soft-ink-faint)]">{item.booking.client.email}</span></span>,
            item.booking.practitioner.user.name,
            item.status,
            duration(item.startedAt, item.endedAt),
            <Link key="session" className="soft-admin-action" href={`/admin/sessions?room=${encodeURIComponent(item.roomName)}`}>Открыть</Link>,
            item.transcriptText ? <a key="transcript" className="soft-admin-action" href={`/api/admin/sessions/${item.id}/transcript`} target="_blank">Открыть</a> : "—",
            item.summaryText ? <a key="summary" className="soft-admin-action" href={`/api/admin/sessions/${item.id}/summary`} target="_blank">Открыть</a> : "—",
          ])}
        />
      </div>
    </main>
  );
}
