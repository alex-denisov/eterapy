export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { getProductCenterData, resolveAdminPeriod } from "../../admin-analytics-data";
import { AdminHero, MetricCard, MetricGrid, PeriodToolbar, formatDateTime, statusLabel } from "../../admin-analytics-ui";
import { BookingsManager, type AdminBookingRow } from "../../bookings/bookings-manager";
import { SessionsTable, type VideoSessionRow } from "../../sessions/sessions-table";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function duration(start: Date | null, end: Date | null) {
  if (!start || !end) return "—";
  return `${Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))} мин`;
}

const transcriptColumns: AdminCompactColumn[] = [
  { key: "createdAt", label: "Timestamp", sortable: true, filterKind: "date" },
  { key: "client", label: "Клиент", sortable: true },
  { key: "practitioner", label: "Практик", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "WAITING", label: "Ожидает" },
      { value: "ACTIVE", label: "Активна" },
      { value: "ENDED", label: "Завершена" },
      { value: "FAILED", label: "Ошибка" },
    ],
  },
  { key: "duration", label: "Длительность", sortable: true, align: "right" },
  { key: "session", label: "Сессия", filterKind: "none", align: "center" },
  { key: "transcript", label: "Транскрипт", filterKind: "none", align: "center" },
  { key: "summary", label: "AI-резюме", filterKind: "none", align: "center" },
];

export default async function ProductSessionsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
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
    <main className="mx-auto min-w-0 max-w-7xl overflow-hidden px-4 py-8 sm:px-6">
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

      <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Бронирования и переносы</h2>
          <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Живое управление бронированиями: перенос слота, пересчет длительности и отмена доступных статусов.</p>
        </div>
        <BookingsManager initial={bookingRows} />
      </section>

      <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Видеосессии и записи</h2>
          <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Текущие комнаты, статусы, длительность и файлы записей.</p>
        </div>
        <SessionsTable rows={videoRows} />
      </section>

      <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Транскрипты и AI-резюме</h2>
        </div>
        <AdminCompactDataTable
          columns={transcriptColumns}
          rows={data.sessions.map((item) => {
            const durationLabel = duration(item.startedAt, item.endedAt);
            const durationSort = item.startedAt && item.endedAt
              ? Math.max(1, Math.round((item.endedAt.getTime() - item.startedAt.getTime()) / 60000))
              : -1;
            const sessionStatus = String(item.status);
            return {
              id: item.id,
              cells: {
                createdAt: { value: formatDateTime(item.createdAt), sortValue: item.createdAt.getTime(), filterValue: formatDateTime(item.createdAt) },
                client: { value: item.booking.client.name, subvalue: item.booking.client.email, filterValue: `${item.booking.client.name} ${item.booking.client.email}` },
                practitioner: item.booking.practitioner.user.name,
                status: { kind: "status", label: statusLabel(item.status), tone: sessionStatus === "ACTIVE" ? "ok" : sessionStatus === "FAILED" ? "danger" : "warn", filterValue: `${item.status} ${statusLabel(item.status)}` },
                duration: { value: durationLabel, sortValue: durationSort },
                session: { kind: "link", href: `/session/${item.booking.id}`, icon: "open", external: true, title: "Открыть сессию" },
                transcript: item.transcriptText
                  ? { kind: "link", href: `/api/admin/sessions/${item.id}/transcript`, icon: "open", external: true, title: "Открыть транскрипт" }
                  : null,
                summary: item.summaryText
                  ? { kind: "link", href: `/api/admin/sessions/${item.id}/summary`, icon: "open", external: true, title: "Открыть AI-резюме" }
                  : null,
              },
            };
          })}
          empty="Транскриптов и AI-резюме за выбранный период нет"
          minWidth="1180px"
        />
      </section>
    </main>
  );
}
