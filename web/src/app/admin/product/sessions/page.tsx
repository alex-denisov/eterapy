export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, FileText, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getProductCenterData, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, DataTable, MetricCard, MetricGrid, PeriodToolbar, StatusBadge, formatDateTime } from "../../admin-analytics-ui";
import { BookingsManager, type AdminBookingRow } from "../../bookings/bookings-manager";
import { SessionsTable, type VideoSessionRow } from "../../sessions/sessions-table";

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
  const [data, bookings, videoSessions] = await Promise.all([
    getProductCenterData(period),
    db.booking.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        client: { select: { name: true, email: true } },
        practitioner: { include: { user: { select: { name: true } } } },
        slot: { select: { startAt: true, endAt: true } },
      },
    }),
    db.videoSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        booking: {
          include: {
            client: { select: { name: true, email: true } },
            practitioner: { select: { user: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);
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
  const bookingRows: AdminBookingRow[] = bookings.map((booking) => ({
    id: booking.id,
    status: booking.status,
    source: booking.source,
    commissionPercentApplied: booking.commissionPercentApplied,
    referrerPractitionerId: booking.referrerPractitionerId,
    priceRub: booking.priceRub,
    durationMin: booking.slot
      ? Math.round((new Date(booking.slot.endAt).getTime() - new Date(booking.slot.startAt).getTime()) / 60000)
      : 60,
    slotStartAt: booking.slot ? new Date(booking.slot.startAt).toISOString() : null,
    createdAt: booking.createdAt.toISOString(),
    client: { name: booking.client.name, email: booking.client.email },
    practitioner: { id: booking.practitioner.id, name: booking.practitioner.user.name },
  }));
  const videoRows: VideoSessionRow[] = videoSessions.map((videoSession) => ({
    id: videoSession.id,
    clientName: videoSession.booking.client.name ?? "Клиент",
    clientEmail: videoSession.booking.client.email ?? "",
    practitionerName: videoSession.booking.practitioner.user.name ?? "Практик",
    status: videoSession.status,
    roomName: videoSession.roomName,
    durationMin:
      videoSession.startedAt && videoSession.endedAt
        ? Math.round((new Date(videoSession.endedAt).getTime() - new Date(videoSession.startedAt).getTime()) / 60000)
        : null,
    createdAt: videoSession.createdAt.toISOString(),
    recordingUrl: videoSession.recordingUrl ?? null,
    recordingExpiry: videoSession.recordingExpiry?.toISOString() ?? null,
  }));

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
        <MetricCard label="Бронирования" value={String(bookings.length)} />
        <MetricCard label="С транскриптом" value={String(withTranscript.length)} />
        <MetricCard label="С AI-резюме" value={String(withSummary.length)} />
      </MetricGrid>

      <section className="mt-6 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Бронирования и переносы</h2>
          <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Живое управление бронированиями: перенос слота, пересчет длительности и отмена доступных статусов.</p>
        </div>
        <BookingsManager initial={bookingRows} />
      </section>

      <section className="mt-6 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Видеосессии и записи</h2>
          <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Текущие комнаты, статусы, длительность и файлы записей.</p>
        </div>
        <SessionsTable rows={videoRows} />
      </section>

      <section className="mt-6 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Транскрипты и AI-резюме</h2>
        </div>
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
            <Link key="session" className="soft-admin-icon-button" href={`/session/${item.booking.id}`} target="_blank" title="Открыть сессию" aria-label="Открыть сессию">
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>,
            item.transcriptText ? (
              <a key="transcript" className="soft-admin-icon-button" href={`/api/admin/sessions/${item.id}/transcript`} target="_blank" title="Открыть транскрипт" aria-label="Открыть транскрипт">
                <FileText className="size-3.5" aria-hidden="true" />
              </a>
            ) : "—",
            item.summaryText ? (
              <a key="summary" className="soft-admin-icon-button" href={`/api/admin/sessions/${item.id}/summary`} target="_blank" title="Открыть AI-резюме" aria-label="Открыть AI-резюме">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </a>
            ) : "—",
          ])}
        />
        <div className="mt-4 flex items-center justify-between text-xs text-[var(--soft-ink-soft)]">
          <Link className="soft-admin-action" data-variant="subtle" href={`/admin/product/sessions?start=${period.startInput}&end=${period.endInput}&q=${encodeURIComponent(q)}&page=${Math.max(1, page - 1)}`}>Назад</Link>
          <span>{page} / {pages} · всего {filtered.length}</span>
          <Link className="soft-admin-action" data-variant="subtle" href={`/admin/product/sessions?start=${period.startInput}&end=${period.endInput}&q=${encodeURIComponent(q)}&page=${Math.min(pages, page + 1)}`}>Вперед</Link>
        </div>
      </section>
    </main>
  );
}
