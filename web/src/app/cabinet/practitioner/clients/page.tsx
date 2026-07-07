export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus, Link2 } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { mskMonthRange } from "@/lib/practitioner-ai-quota";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { ClientsListClient, type ClientListRow } from "./clients-list-client";

// B466 — «Клиенты» (mockups -clients-list / -clients-empty): список клиентов
// практика с поиском и attention-тегами (свежий разбор · новый клиент);
// строка ведёт в карточку клиента (CRM).

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });

export default async function PractitionerClientsPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true },
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

  const rows: ClientListRow[] = [...byClient.entries()].map(([clientId, list]) => {
    const client = list[0].client;
    const completed = list.filter((b) => b.status === "COMPLETED");
    const upcoming = list
      .filter((b) => ["CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.slot && b.slot.endAt >= now)
      .sort((a, b) => (a.slot!.startAt.getTime() - b.slot!.startAt.getTime()))[0];
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
      nextLabel: upcoming?.slot
        ? `${DAY_FMT.format(upcoming.slot.startAt)}`
        : null,
      attention: (freshAnalysis ? "разбор" : isNew ? "новый" : null) as ClientListRow["attention"],
    };
  }).sort((a, b) => (b.nextLabel ? 1 : 0) - (a.nextLabel ? 1 : 0) || a.label.localeCompare(b.label, "ru"));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-clients-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow">Кабинет практика</p>
          <h1 className="soft-h1 mt-2">Клиенты</h1>
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
          <p className="soft-h3" style={{ color: "var(--soft-bordeaux)" }}>Пока нет клиентов</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Клиенты появляются после первой записи. Поделитесь личной ссылкой для записи или проверьте, что часы
            открыты в «Доступности».
          </p>
          <Link href={appUrl("/practitioner/calendar?tab=availability")} className="soft-button soft-button-primary mt-5 inline-flex">
            <Link2 className="size-4" aria-hidden="true" />
            Открыть доступность
          </Link>
        </section>
      ) : (
        <ClientsListClient rows={rows} />
      )}
    </div>
  );
}
