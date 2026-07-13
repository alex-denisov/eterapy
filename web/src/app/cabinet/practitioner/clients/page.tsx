export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus, Link2, MessageSquare } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { mskMonthRange } from "@/lib/practitioner-ai-quota";
import { loadPractitionerAppbar } from "@/lib/practitioner-appbar";
import { appUrl, loginUrl } from "@/lib/subdomain";
import type { ClientListRow } from "./clients-list-client";
import { ClientsMasterListDesktop } from "./clients-master-desktop";
import { PractitionerClientsMobile } from "./clients-mobile";
import { CardOverview } from "./[id]/card-overview";
import { CardSessions } from "./[id]/card-sessions";
import { CardPlan } from "./[id]/card-plan";
import { CardMessages } from "./[id]/card-messages";

// B466 — «Клиенты». Мобильный список (mockups -clients-list/-empty) + десктоп
// МАСТЕР-ДЕТЕЙЛ (mockup practitioner-desktop-clients-v2): список слева +
// карточка выбранного клиента справа. Табы Обзор/Сессии/План/Сообщения — те же
// СЕРВЕРНЫЕ компоненты, что и /clients/[id]; выбор клиента/таба через
// `?client=&tab=` (сервер перерисовывает правую панель, ничего не дублируем).

type CardTab = "overview" | "sessions" | "plan" | "messages";
const CARD_TABS: Array<{ key: CardTab; label: string }> = [
  { key: "overview", label: "Обзор" },
  { key: "sessions", label: "Сессии" },
  { key: "plan", label: "План сопровождения" },
  { key: "messages", label: "Сообщения" },
];

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });

function initialsOf(label: string): string {
  return label.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// Load a single client's full detail with the SAME field set as /clients/[id]
// so the reused card components (CardOverview/CardSessions/…) get identical
// data. Returned inline so TypeScript infers the narrowed booking shape.
async function loadClientDetail(practitionerId: string, clientId: string) {
  const detailBookings = await db.booking.findMany({
    where: { practitionerId, clientId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      meetingContext: true,
      priceRub: true,
      slot: { select: { startAt: true, endAt: true } },
      videoSession: {
        select: { id: true, summaryText: true, transcriptText: true, serverSttStatus: true, createdAt: true },
      },
    },
  });
  const client = await db.user.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, email: true },
  });
  if (!client || detailBookings.length === 0) return null;
  const label = client.name ?? client.email ?? "Клиент";
  return {
    clientId: client.id,
    clientLabel: label,
    initials: initialsOf(label),
    sinceLabel: DAY_FMT.format(detailBookings[0].createdAt),
    completedCount: detailBookings.filter((b) => b.status === "COMPLETED").length,
    detailBookings,
  };
}

export default async function PractitionerClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; tab?: string }>;
}) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true, title: true, user: { select: { name: true, email: true } } },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = mskMonthRange(now).start;

  const bookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      clientId: true,
      status: true,
      createdAt: true,
      slot: { select: { startAt: true, endAt: true } },
      client: { select: { id: true, name: true, email: true } },
      videoSession: { select: { summaryText: true, createdAt: true } },
    },
  });

  // Свод по клиентам.
  const byClient = new Map<string, typeof bookings>();
  for (const b of bookings) {
    byClient.set(b.clientId, [...(byClient.get(b.clientId) ?? []), b]);
  }

  const rows: ClientListRow[] = [...byClient.entries()]
    .map(([clientId, list]) => {
      const client = list[0].client;
      const completed = list.filter((b) => b.status === "COMPLETED");
      const upcoming = list
        .filter((b) => ["CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.slot && b.slot.endAt >= now)
        .sort((a, b) => a.slot!.startAt.getTime() - b.slot!.startAt.getTime())[0];
      const firstBooking = list[list.length - 1];
      const freshAnalysis = list.some(
        (b) => b.videoSession?.summaryText && b.videoSession.createdAt >= weekAgo,
      );
      const isNew = firstBooking.createdAt >= monthStart && completed.length <= 1;
      return {
        id: clientId,
        label: client.name ?? client.email ?? "Клиент",
        sessionsCount: completed.length,
        sinceLabel: DAY_FMT.format(firstBooking.createdAt),
        nextLabel: upcoming?.slot ? `${DAY_FMT.format(upcoming.slot.startAt)}` : null,
        attention: (freshAnalysis ? "разбор" : isNew ? "новый" : null) as ClientListRow["attention"],
      };
    })
    .sort((a, b) => (b.nextLabel ? 1 : 0) - (a.nextLabel ? 1 : 0) || a.label.localeCompare(b.label, "ru"));

  const appbar = await loadPractitionerAppbar({
    userId: session.user!.id!,
    name: practitioner.user.name,
    email: practitioner.user.email,
    title: practitioner.title,
  });

  // Desktop master-detail — resolve the selected client (URL or first row) and
  // its active tab, then load that client's full detail (same field set as the
  // /clients/[id] card so the reused card components get identical data).
  const { client: rawClient, tab: rawTab } = await searchParams;
  const selectedId = rows.find((r) => r.id === rawClient)?.id ?? rows[0]?.id ?? null;
  const tab: CardTab = (CARD_TABS.some((t) => t.key === rawTab) ? rawTab : "overview") as CardTab;

  const detail = selectedId ? await loadClientDetail(practitioner.id, selectedId) : null;

  return (
    <>
      <PractitionerClientsMobile
        appbar={appbar}
        rows={rows}
        inviteHref={appUrl("/practitioner/invite")}
        proposeHref={appUrl("/practitioner/calendar/propose")}
      />
      <div
        className="mx-auto hidden w-full max-w-6xl px-4 py-8 sm:px-6 md:block"
        style={{ paddingBottom: 80 }}
        data-testid="practitioner-clients-page"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="soft-eyebrow">Практика</p>
            <h1 className="soft-h1 mt-1.5">Клиенты</h1>
          </div>
          {rows.length > 0 && (
            <Link href={appUrl("/practitioner/calendar/propose")} className="soft-button soft-button-primary">
              <CalendarPlus className="size-4" aria-hidden="true" />
              Записать
            </Link>
          )}
        </div>

        {rows.length === 0 ? (
          <section className="soft-card mt-6 p-6 text-center" data-testid="practitioner-clients-empty">
            <p className="soft-h3" style={{ color: "var(--soft-bordeaux)" }}>
              Пока нет клиентов
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Клиенты появляются после первой записи. Поделитесь личной ссылкой для записи или проверьте, что часы
              открыты в «Доступности».
            </p>
            <Link
              href={appUrl("/practitioner/calendar?tab=availability")}
              className="soft-button soft-button-primary mt-5 inline-flex"
            >
              <Link2 className="size-4" aria-hidden="true" />
              Открыть доступность
            </Link>
          </section>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(300px,360px)_1fr] lg:items-start">
            <ClientsMasterListDesktop rows={rows} selectedId={selectedId} />

            {detail ? (
              <section className="soft-card p-6" data-testid="practitioner-client-card">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <span
                      className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, var(--soft-terracotta), var(--soft-bordeaux))" }}
                    >
                      {detail.initials}
                    </span>
                    <div className="min-w-0">
                      <h2 className="soft-h2 truncate">{detail.clientLabel}</h2>
                      <p className="mt-0.5 text-[13px] text-[var(--soft-ink-faint)]">
                        Индивидуальная сессия · {detail.completedCount}{" "}
                        {detail.completedCount === 1 ? "встреча" : detail.completedCount < 5 && detail.completedCount > 0 ? "встречи" : "встреч"} · с {detail.sinceLabel}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <Link
                      href={appUrl(`/practitioner/clients?client=${detail.clientId}&tab=messages`)}
                      scroll={false}
                      className="soft-button soft-button-ghost gap-2"
                      style={{ minHeight: "2.5rem", padding: "0.5rem 1.1rem", fontSize: "13.5px" }}
                    >
                      <MessageSquare className="size-4" aria-hidden="true" />
                      Сообщение
                    </Link>
                    <Link
                      href={appUrl(`/practitioner/calendar/propose?client=${detail.clientId}`)}
                      className="soft-button soft-button-primary gap-2"
                      style={{ minHeight: "2.5rem", padding: "0.5rem 1.1rem", fontSize: "13.5px" }}
                    >
                      <CalendarPlus className="size-4" aria-hidden="true" />
                      Записать
                    </Link>
                  </div>
                </div>

                {/* Tabs */}
                <div
                  className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1"
                  data-testid="client-card-tabs"
                >
                  {CARD_TABS.map((t) => (
                    <Link
                      key={t.key}
                      href={appUrl(`/practitioner/clients?client=${detail.clientId}&tab=${t.key}`)}
                      scroll={false}
                      className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        tab === t.key ? "soft-select-pill" : "text-[var(--soft-ink-soft)] hover:text-foreground"
                      }`}
                      aria-current={tab === t.key ? "page" : undefined}
                    >
                      {t.label}
                    </Link>
                  ))}
                </div>

                {tab === "overview" && (
                  <CardOverview
                    practitionerId={practitioner.id}
                    clientId={detail.clientId}
                    clientLabel={detail.clientLabel}
                    bookings={detail.detailBookings}
                  />
                )}
                {tab === "sessions" && <CardSessions bookings={detail.detailBookings} />}
                {tab === "plan" && <CardPlan practitionerId={practitioner.id} clientId={detail.clientId} />}
                {tab === "messages" && (
                  <CardMessages
                    practitionerId={practitioner.id}
                    clientId={detail.clientId}
                    clientLabel={detail.clientLabel}
                  />
                )}
              </section>
            ) : (
              <section className="soft-card flex items-center justify-center p-10 text-sm text-[var(--soft-ink-faint)]">
                Выберите клиента слева, чтобы открыть карточку.
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}
