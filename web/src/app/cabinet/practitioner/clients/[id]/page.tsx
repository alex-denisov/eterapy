export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarPlus, MessageSquare } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { CardOverview } from "./card-overview";
import { CardSessions } from "./card-sessions";
import { CardPlan } from "./card-plan";
import { CardMessages } from "./card-messages";
import { PractitionerClientCardMobile } from "./card-mobile";

// B466 — карточка клиента (CRM hub; mockups -client-overview/-sessions/-plan/
// -messages): header (формат «Индивидуальная сессия» + «клиент с … · N
// сессий») + quick actions «Записать» (B480) / «Сообщение» (B478) + 4 таба.

type CardTab = "overview" | "sessions" | "plan" | "messages";
const TABS: Array<{ key: CardTab; label: string }> = [
  { key: "overview", label: "Обзор" },
  { key: "sessions", label: "Сессии" },
  { key: "plan", label: "План" },
  { key: "messages", label: "Сообщения" },
];

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });

export default async function PractitionerClientCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const { id: clientId } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: CardTab = (TABS.some((t) => t.key === rawTab) ? rawTab : "overview") as CardTab;

  const bookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, clientId },
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
  if (bookings.length === 0) notFound();

  const client = await db.user.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, email: true },
  });
  if (!client) notFound();

  const clientLabel = client.name ?? client.email ?? "Клиент";
  const initials = clientLabel
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
  const completedCount = bookings.filter((b) => b.status === "COMPLETED").length;
  const sinceLabel = DAY_FMT.format(bookings[0].createdAt);
  const nowTs = new Date();
  const monthAgo = new Date(nowTs.getTime() - 30 * 24 * 60 * 60 * 1000);
  const isNew = bookings[0].createdAt >= monthAgo && completedCount <= 1;

  return (
    <>
      {/* R9-4 P2 — мобильная карточка 1-в-1 по макетам; десктоп ниже прежний
          (ждёт R9-5 новых десктоп-макетов). */}
      <PractitionerClientCardMobile
        practitionerId={practitioner.id}
        clientId={client.id}
        clientLabel={clientLabel}
        initials={initials}
        sinceLabel={sinceLabel}
        completedCount={completedCount}
        isNew={isNew}
        bookings={bookings}
        tab={tab}
      />
      <div className="mx-auto hidden w-full max-w-3xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-client-card">
      <Link href={appUrl("/practitioner/clients")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Клиенты
      </Link>

      {/* Header */}
      <div className="mt-4 flex items-center gap-3.5">
        <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--soft-terracotta), var(--soft-bordeaux))" }}>
          {initials}
        </span>
        <div className="min-w-0">
          <h1 className="soft-h2 truncate">{clientLabel}</h1>
          <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
            <span className="mr-1.5 rounded-md bg-[var(--soft-paper-deep)] px-1.5 py-px font-medium text-[var(--soft-ink-soft)]">
              Индивидуальная сессия
            </span>
            клиент с {sinceLabel} · {completedCount} {completedCount === 1 ? "сессия" : completedCount < 5 && completedCount > 0 ? "сессии" : "сессий"}
          </p>
        </div>
      </div>

      {/* Quick actions — mockup .btn: compact 13.5px / ~40px tall; half-width on
          mobile (grid), hug-content on desktop (R9-2: не растягивать на max-w-3xl). */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:flex sm:w-fit">
        <Link
          href={appUrl(`/practitioner/calendar/propose?client=${client.id}`)}
          className="soft-button soft-button-primary justify-center gap-2 sm:px-5"
          style={{ minHeight: "2.5rem", padding: "0.55rem 1.15rem", fontSize: "13.5px" }}
          data-testid="client-card-propose"
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          Записать
        </Link>
        <Link
          href={appUrl(`/practitioner/clients/${client.id}?tab=messages`)}
          className="soft-button soft-button-ghost justify-center gap-2 sm:px-5"
          style={{ minHeight: "2.5rem", padding: "0.55rem 1.15rem", fontSize: "13.5px" }}
          data-testid="client-card-message"
        >
          <MessageSquare className="size-4" aria-hidden="true" />
          Сообщение
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1" data-testid="client-card-tabs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={appUrl(`/practitioner/clients/${client.id}?tab=${t.key}`)}
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
        <CardOverview practitionerId={practitioner.id} clientId={client.id} clientLabel={clientLabel} bookings={bookings} />
      )}
      {tab === "sessions" && <CardSessions bookings={bookings} />}
      {tab === "plan" && <CardPlan practitionerId={practitioner.id} clientId={client.id} />}
      {tab === "messages" && (
        <CardMessages practitionerId={practitioner.id} clientId={client.id} clientLabel={clientLabel} />
      )}
      </div>
    </>
  );
}
