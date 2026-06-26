export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProductCenterData, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, DataTable, MetricCard, MetricGrid, PeriodToolbar, StatusBadge, formatDateTime } from "../../admin-analytics-ui";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function duration(start: Date | null, end: Date | null) {
  if (!start || !end) return "—";
  return `${Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))} мин`;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductSessionsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const q = (first(params.q) ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(first(params.page)) || 1);
  const data = await getProductCenterData(period);
  const active = data.sessions.filter((item) => item.status === "ACTIVE" || item.status === "WAITING");
  const withTranscript = data.sessions.filter((item) => item.transcriptText);
  const withSummary = data.sessions.filter((item) => item.summaryText);
  const filtered = data.sessions.filter((item) => {
    if (!q) return true;
    return [
      item.status,
      item.roomName,
      item.booking.client.name,
      item.booking.client.email,
      item.booking.practitioner.user.name,
    ].some((value) => value?.toLowerCase().includes(q));
  });
  const take = 20;
  const pages = Math.max(1, Math.ceil(filtered.length / take));
  const rows = filtered.slice((page - 1) * take, page * take);

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
        <form className="mb-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="start" value={period.startInput} />
          <input type="hidden" name="end" value={period.endInput} />
          <input name="q" defaultValue={q} placeholder="Поиск по клиенту, практику, комнате, статусу" className="min-w-72 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-3 py-2 text-sm" />
          <button className="soft-admin-action" type="submit">Найти</button>
        </form>
        <DataTable
          columns={["Timestamp", "Клиент", "Практик", "Статус", "Длительность", "Сессия", "Транскрипт", "AI-резюме"]}
          rows={rows.map((item) => [
            formatDateTime(item.createdAt),
            <span key="client">{item.booking.client.name}<br /><span className="text-xs text-[var(--soft-ink-faint)]">{item.booking.client.email}</span></span>,
            item.booking.practitioner.user.name,
            <StatusBadge key="status" status={item.status} />,
            duration(item.startedAt, item.endedAt),
            <Link key="session" className="soft-admin-action" href={`/admin/sessions?room=${encodeURIComponent(item.roomName)}`}>Открыть</Link>,
            item.transcriptText ? <a key="transcript" className="soft-admin-action" href={`/api/admin/sessions/${item.id}/transcript`} target="_blank">Открыть</a> : "—",
            item.summaryText ? <a key="summary" className="soft-admin-action" href={`/api/admin/sessions/${item.id}/summary`} target="_blank">Открыть</a> : "—",
          ])}
        />
        <div className="mt-4 flex items-center justify-between text-xs text-[var(--soft-ink-soft)]">
          <Link className="soft-admin-action" data-variant="subtle" href={`/admin/product/sessions?start=${period.startInput}&end=${period.endInput}&q=${encodeURIComponent(q)}&page=${Math.max(1, page - 1)}`}>Назад</Link>
          <span>{page} / {pages} · всего {filtered.length}</span>
          <Link className="soft-admin-action" data-variant="subtle" href={`/admin/product/sessions?start=${period.startInput}&end=${period.endInput}&q=${encodeURIComponent(q)}&page=${Math.min(pages, page + 1)}`}>Вперед</Link>
        </div>
      </div>
    </main>
  );
}
