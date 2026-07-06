export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { CalendarTabs, type CalendarTabKey } from "./calendar-tabs";
import { ScheduleTab } from "./schedule-tab";
import { RequestsTab } from "./requests-tab";
import { AvailabilityTab } from "./availability-tab";

// B466 — «Календарь»: Расписание · Заявки · Доступность (заменяет старые
// /schedule и /requests — они редиректят сюда).

const TAB_KEYS = new Set<CalendarTabKey>(["schedule", "requests", "availability"]);

export default async function PractitionerCalendarPage({
  searchParams,
}: {
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

  const { tab: rawTab } = await searchParams;
  const tab: CalendarTabKey = TAB_KEYS.has(rawTab as CalendarTabKey) ? (rawTab as CalendarTabKey) : "schedule";

  const [pendingCount, changeCount] = await Promise.all([
    db.booking.count({ where: { practitionerId: practitioner.id, status: "PENDING" } }),
    db.bookingChangeRequest.count({
      where: { status: "PENDING", initiatedBy: "CLIENT", booking: { practitionerId: practitioner.id } },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-calendar-page">
      <p className="soft-eyebrow">Календарь практика</p>
      <h1 className="soft-h1 mt-2">Календарь</h1>
      <CalendarTabs active={tab} requestCount={pendingCount + changeCount} />

      {tab === "schedule" && <ScheduleTab practitionerId={practitioner.id} />}
      {tab === "requests" && <RequestsTab practitionerId={practitioner.id} />}
      {tab === "availability" && <AvailabilityTab practitionerId={practitioner.id} />}
    </div>
  );
}
