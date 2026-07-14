export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { loadPractitionerAppbar } from "@/lib/practitioner-appbar";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";
import { CalendarTabs, type CalendarTabKey } from "./calendar-tabs";
import { RequestsTab } from "./requests-tab";
import { AvailabilityTab } from "./availability-tab";
import { AvailabilityMobile } from "./availability-mobile";
import { WeekGrid, mskMondayISO, normalizeWeekParam } from "./week-grid";
import {
  CalendarRequestsMobile,
  CalendarScheduleMobile,
  PractitionerCalendarMobileShell,
} from "./calendar-mobile";

// B466 — «Календарь»: Расписание · Заявки · Доступность (заменяет старые
// /schedule и /requests — они редиректят сюда). R9-5 desktop: «Расписание» —
// недельная сетка (week-grid) с навигацией по ?week=; мобайл — прежний список.

const TAB_KEYS = new Set<CalendarTabKey>(["schedule", "requests", "availability"]);

export default async function PractitionerCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; week?: string }>;
}) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true, title: true, slug: true, user: { select: { name: true, email: true } } },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const { tab: rawTab, week: rawWeek } = await searchParams;
  const tab: CalendarTabKey = TAB_KEYS.has(rawTab as CalendarTabKey) ? (rawTab as CalendarTabKey) : "schedule";
  const weekStartISO = normalizeWeekParam(rawWeek) ?? mskMondayISO(new Date());

  const [pendingCount, changeCount, appbar] = await Promise.all([
    db.booking.count({ where: { practitionerId: practitioner.id, status: "PENDING" } }),
    db.bookingChangeRequest.count({
      where: { status: "PENDING", initiatedBy: "CLIENT", booking: { practitionerId: practitioner.id } },
    }),
    loadPractitionerAppbar({
      userId: session.user!.id!,
      name: practitioner.user.name,
      email: practitioner.user.email,
      title: practitioner.title,
    }),
  ]);

  // Данные мобильной «Доступности» (клиентский компонент — форма из макета).
  const availabilityMobileData =
    tab === "availability"
      ? await Promise.all([
          db.scheduleRule.findMany({ where: { practitionerId: practitioner.id }, orderBy: { dayOfWeek: "asc" } }),
          db.priceRate.findMany({ where: { practitionerId: practitioner.id }, orderBy: { durationMin: "asc" } }),
        ])
      : null;

  return (
    <>
      {/* R9-4 P3 — мобильный календарь 1-в-1 по макетам; десктоп ниже прежний
          (ждёт R9-5 новых десктоп-макетов). */}
      <PractitionerCalendarMobileShell appbar={appbar} tab={tab} requestCount={pendingCount + changeCount}>
        {tab === "schedule" && <CalendarScheduleMobile practitionerId={practitioner.id} />}
        {tab === "requests" && <CalendarRequestsMobile practitionerId={practitioner.id} />}
        {tab === "availability" && availabilityMobileData && (
          <AvailabilityMobile
            practitionerId={practitioner.id}
            initialRules={availabilityMobileData[0].map((r) => ({
              dayOfWeek: r.dayOfWeek,
              startHour: r.startHour,
              startMinute: r.startMinute,
              endHour: r.endHour,
              endMinute: r.endMinute,
              enabled: r.enabled,
            }))}
            initialRates={availabilityMobileData[1].map((r) => ({
              durationMin: r.durationMin,
              priceRub: r.priceRub,
              enabled: r.enabled,
            }))}
            bookingUrl={practitioner.slug ? mainUrl(`/practitioners/${practitioner.slug}`) : mainUrl("/practitioners")}
          />
        )}
      </PractitionerCalendarMobileShell>

      <div className="mx-auto hidden w-full max-w-4xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-calendar-page">
        <p className="soft-eyebrow">Практика</p>
        <h1 className="soft-h1 mt-2">Календарь</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Расписание, заявки на запись и доступность для клиентов. Клиенты записываются только в открытые часы.
        </p>
        <CalendarTabs active={tab} requestCount={pendingCount + changeCount} />

        {tab === "schedule" && <WeekGrid practitionerId={practitioner.id} weekStartISO={weekStartISO} />}
        {tab === "requests" && <RequestsTab practitionerId={practitioner.id} />}
        {tab === "availability" && <AvailabilityTab practitionerId={practitioner.id} />}
      </div>
    </>
  );
}
